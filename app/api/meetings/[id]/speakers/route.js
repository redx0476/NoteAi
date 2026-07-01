import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

// Rename a speaker across the whole meeting (e.g. "Speaker 1" -> "Alex").
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const { from, to } = (await request.json().catch(() => ({}))) || {};
  if (!from || !to) return Response.json({ error: 'from and to required' }, { status: 400 });

  await pool.query('UPDATE segments SET speaker = $1 WHERE meeting_id = $2 AND speaker = $3', [to, params.id, from]);
  await pool.query('UPDATE highlights SET speaker = $1 WHERE meeting_id = $2 AND speaker = $3', [to, params.id, from]);
  return Response.json({ ok: true });
}
