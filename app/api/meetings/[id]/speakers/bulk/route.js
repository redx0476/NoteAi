import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

// Bulk-rename several speakers at once. Body: { map: { "Speaker 1": "Alex", ... } }.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) || {};
  const map = body.map && typeof body.map === 'object' ? body.map : {};
  for (const [from, to] of Object.entries(map)) {
    const t = String(to).trim();
    if (!from || !t || from === t) continue;
    await pool.query('UPDATE segments SET speaker = $1 WHERE meeting_id = $2 AND speaker = $3', [t, params.id, from]);
    await pool.query('UPDATE highlights SET speaker = $1 WHERE meeting_id = $2 AND speaker = $3', [t, params.id, from]);
  }
  return Response.json({ ok: true });
}
