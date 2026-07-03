import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getMeeting } from '@/lib/meetings';
import { summarizeMeeting } from '@/lib/services/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Refresh the AI notes for a meeting that is still in progress. Unlike
// /end, this never changes the meeting status — the call stays 'live' so the
// summary can be regenerated repeatedly as more of the transcript arrives.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const meeting = await getMeeting(params.id, payload.uid);
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  // Nothing to summarize yet — return the meeting unchanged (skip the LLM call).
  if (!meeting.segments?.length) return Response.json(meeting);

  const model = (await request.json().catch(() => ({})))?.model;

  try {
    const { title, summary, objectives, actionItems, chapters, keywords } = await summarizeMeeting(
      meeting.segments,
      model
    );
    const { rows } = await pool.query(
      `UPDATE meetings
         SET title = CASE WHEN $1 <> '' AND $1 <> 'Untitled meeting' THEN $1 ELSE title END,
             summary = $2, objectives = $3, action_items = $4, chapters = $5, keywords = $6
       WHERE id = $7
       RETURNING title`,
      [
        title,
        summary,
        JSON.stringify(objectives),
        JSON.stringify(actionItems),
        JSON.stringify(chapters),
        JSON.stringify(keywords),
        meeting.id,
      ]
    );
    // Merge into the meeting fetched above — no second full-transcript read.
    return Response.json({ ...meeting, title: rows[0].title, summary, objectives, actionItems, chapters, keywords });
  } catch (err) {
    // Leave the meeting live and untouched so the next interval can retry.
    return Response.json({ error: 'Notes generation failed', detail: String(err.message) }, { status: 502 });
  }
}
