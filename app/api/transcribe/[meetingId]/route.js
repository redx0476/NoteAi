import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';
import { transcribeChunk } from '@/lib/services/transcription';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Receives one audio chunk from the recorder, transcribes it, stores it as a
// segment, and returns the text so the live panel can render it immediately.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.meetingId, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('audio');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'No audio chunk' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await transcribeChunk(buffer, file.type || 'audio/webm');
    if (text) {
      const speaker = form.get('speaker') || 'Speaker 1';
      const tOffset = Number(form.get('tOffset') || 0);
      await pool.query(
        'INSERT INTO segments (meeting_id, speaker, text, t_offset) VALUES ($1, $2, $3, $4)',
        [params.meetingId, speaker, text, tOffset]
      );
    }
    return Response.json({ text });
  } catch (err) {
    return Response.json({ error: 'Transcription failed', detail: String(err.message) }, { status: 502 });
  }
}
