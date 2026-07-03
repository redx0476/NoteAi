import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getMeeting } from '@/lib/meetings';
import { summarizeMeeting } from '@/lib/services/llm';
import { saveImport } from '@/lib/audio';
import { deepgramEnabled, transcribeFile } from '@/lib/services/deepgram';
import { transcribeChunk } from '@/lib/services/transcription';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Import an audio/video file → transcribe (with diarization) → summarize.
export async function POST(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'No file uploaded' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const originalname = file.name || 'Imported recording';
  const mimetype = file.type || 'audio/mpeg';
  const model = form.get('model') || undefined;

  const id = randomUUID();
  const title = originalname.replace(/\.[^.]+$/, '') || 'Imported recording';
  const ext = originalname.split('.').pop() || 'mp3';

  await pool.query(
    `INSERT INTO meetings (id, user_id, title, platform, has_audio) VALUES ($1, $2, $3, 'import', true)`,
    [id, payload.uid, title]
  );

  try {
    const utterances = deepgramEnabled()
      ? await transcribeFile(buffer, mimetype)
      : [{ speaker: 'Speaker 1', text: await transcribeChunk(buffer, mimetype), start: 0 }];

    for (const u of utterances) {
      if (u.text) {
        await pool.query(
          'INSERT INTO segments (meeting_id, speaker, text, t_offset) VALUES ($1, $2, $3, $4)',
          [id, u.speaker, u.text, u.start || 0]
        );
      }
    }

    const objectKey = await saveImport(id, buffer, ext);
    if (objectKey) {
      await pool.query('UPDATE meetings SET audio_object_key = $1 WHERE id = $2', [objectKey, id]);
    }

    const segments = utterances.map((u) => ({ speaker: u.speaker, text: u.text }));
    const notes = await summarizeMeeting(segments, model).catch(() => null);
    const finalTitle = notes?.title && notes.title !== 'Untitled meeting' ? notes.title : title;

    await pool.query(
      `UPDATE meetings SET status = 'ended', ended_at = now(),
         title = $1, summary = $2, action_items = $3, chapters = $4, keywords = $5
       WHERE id = $6`,
      [
        finalTitle,
        notes?.summary || '',
        JSON.stringify(notes?.actionItems || []),
        JSON.stringify(notes?.chapters || []),
        JSON.stringify(notes?.keywords || []),
        id,
      ]
    );
    return Response.json(await getMeeting(id, payload.uid));
  } catch (err) {
    await pool.query(`UPDATE meetings SET status = 'ended', ended_at = now() WHERE id = $1`, [id]);
    return Response.json({ error: 'Transcription failed', detail: String(err.message) }, { status: 502 });
  }
}
