import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

// Save a transcript moment as a highlight/bookmark.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { text, speaker, tOffset } = (await request.json().catch(() => ({}))) || {};
  if (!text) return Response.json({ error: 'text required' }, { status: 400 });

  const { rows } = await pool.query(
    'INSERT INTO highlights (meeting_id, speaker, text, t_offset) VALUES ($1, $2, $3, $4) RETURNING id',
    [params.id, speaker || null, text, Number(tOffset || 0)]
  );
  return Response.json({ id: rows[0].id, speaker: speaker || null, text, tOffset: Number(tOffset || 0) });
}
