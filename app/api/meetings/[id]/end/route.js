import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getMeeting } from '@/lib/meetings';
import { summarizeMeeting } from '@/lib/services/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// End the meeting and generate AI notes.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const meeting = await getMeeting(params.id, payload.uid);
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  const model = (await request.json().catch(() => ({})))?.model;

  try {
    const { title, summary, actionItems, chapters, keywords } = await summarizeMeeting(
      meeting.segments,
      model
    );
    await pool.query(
      `UPDATE meetings
         SET status = 'ended', ended_at = now(),
             title = CASE WHEN $1 <> '' AND $1 <> 'Untitled meeting' THEN $1 ELSE title END,
             summary = $2, action_items = $3, chapters = $4, keywords = $5
       WHERE id = $6`,
      [
        title,
        summary,
        JSON.stringify(actionItems),
        JSON.stringify(chapters),
        JSON.stringify(keywords),
        meeting.id,
      ]
    );
  } catch (err) {
    await pool.query(`UPDATE meetings SET status = 'ended', ended_at = now() WHERE id = $1`, [meeting.id]);
    return Response.json({ error: 'Notes generation failed', detail: String(err.message) }, { status: 502 });
  }
  return Response.json(await getMeeting(meeting.id, payload.uid));
}
