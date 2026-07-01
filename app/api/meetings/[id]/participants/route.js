import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

// Store the meeting's participant roster so speaker labels can be mapped to
// real attendee names.
export async function POST(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) || {};
  const names = Array.isArray(body.names)
    ? [...new Set(body.names.map((n) => String(n).trim()).filter(Boolean))].slice(0, 50)
    : [];
  await pool.query('UPDATE meetings SET participants = $1 WHERE id = $2', [JSON.stringify(names), params.id]);
  return Response.json({ ok: true, participants: names });
}
