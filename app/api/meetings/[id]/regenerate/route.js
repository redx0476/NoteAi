import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { getMeeting } from '@/lib/meetings';
import { summarizeMeeting } from '@/lib/services/llm';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Regenerate AI notes for an ended meeting as a preview: runs the LLM and
// returns the fresh notes WITHOUT saving them. The client shows them for
// review and persists via PUT only after the user approves.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const meeting = await getMeeting(params.id, payload.uid);
  if (!meeting) return Response.json({ error: 'Not found' }, { status: 404 });

  // Live meetings keep the /live-summary refresh path.
  if (meeting.status !== 'ended') {
    return Response.json({ error: 'Meeting is still live' }, { status: 409 });
  }
  if (!meeting.segments?.length) {
    return Response.json({ error: 'No transcript to summarize' }, { status: 400 });
  }

  const model = (await request.json().catch(() => ({})))?.model;

  try {
    const notes = await summarizeMeeting(meeting.segments, model);
    return Response.json(notes);
  } catch (err) {
    return Response.json({ error: 'Notes generation failed', detail: String(err.message) }, { status: 502 });
  }
}

// Apply a previously previewed set of notes. Persists exactly what the user
// reviewed (carried in the body) — no second LLM call, so an approved preview
// can never differ from what gets saved.
export async function PUT(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows: owned } = await pool.query(
    'SELECT id, status FROM meetings WHERE id = $1 AND user_id = $2',
    [params.id, payload.uid]
  );
  if (!owned[0]) return Response.json({ error: 'Not found' }, { status: 404 });
  if (owned[0].status !== 'ended') {
    return Response.json({ error: 'Meeting is still live' }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.summary !== 'string') {
    return Response.json({ error: 'No notes to apply' }, { status: 400 });
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const summary = body.summary;
  const strArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const objectives = strArray(body.objectives);
  const keywords = strArray(body.keywords);
  const actionItems = (Array.isArray(body.actionItems) ? body.actionItems : [])
    .map((a) => ({ text: String(a?.text || ''), owner: a?.owner ?? null }))
    .filter((a) => a.text);
  const chapters = (Array.isArray(body.chapters) ? body.chapters : []).map((c) => ({
    title: String(c?.title || ''),
    summary: String(c?.summary || ''),
  }));

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
      params.id,
    ]
  );
  return Response.json({ ok: true, title: rows[0].title, summary, objectives, actionItems, chapters, keywords });
}
