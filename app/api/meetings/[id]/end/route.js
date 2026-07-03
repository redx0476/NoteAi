import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getMeeting, fmtTs } from '@/lib/meetings';
import { summarizeMeeting } from '@/lib/services/llm';
import { finalizeRecording } from '@/lib/audio';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// End the meeting and generate AI notes.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const meeting = await getMeeting(params.id, payload.uid);
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  // Idempotent: concurrent stop triggers (popup Stop + tab close) both land
  // here — only the first one runs the LLM; the rest get the finished meeting.
  if (meeting.status !== 'live') return Response.json(meeting);

  const model = (await request.json().catch(() => ({})))?.model;

  // Authoritative S3 upload point — the ingest socket may already have
  // finalized on close, but this covers batch-only recordings too.
  finalizeRecording(meeting.id).catch((err) =>
    console.error('end: failed to finalize recording:', err.message)
  );

  try {
    const { title, summary, actionItems, chapters, keywords } = await summarizeMeeting(
      meeting.segments,
      model
    );
    const { rows } = await pool.query(
      `UPDATE meetings
         SET status = 'ended', ended_at = now(),
             title = CASE WHEN $1 <> '' AND $1 <> 'Untitled meeting' THEN $1 ELSE title END,
             summary = $2, action_items = $3, chapters = $4, keywords = $5
       WHERE id = $6
       RETURNING title, ended_at`,
      [
        title,
        summary,
        JSON.stringify(actionItems),
        JSON.stringify(chapters),
        JSON.stringify(keywords),
        meeting.id,
      ]
    );
    // Merge the updates into the meeting we already fetched instead of
    // re-reading the whole transcript.
    return Response.json({
      ...meeting,
      status: 'ended',
      title: rows[0].title,
      endedAt: fmtTs(rows[0].ended_at),
      summary,
      actionItems,
      chapters,
      keywords,
    });
  } catch (err) {
    await pool.query(`UPDATE meetings SET status = 'ended', ended_at = now() WHERE id = $1`, [meeting.id]);
    return Response.json({ error: 'Notes generation failed', detail: String(err.message) }, { status: 502 });
  }
}
