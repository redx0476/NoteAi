import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { ownsMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

export async function DELETE(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsMeeting(params.id, payload.uid))) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  await pool.query('DELETE FROM highlights WHERE id = $1 AND meeting_id = $2', [params.hid, params.id]);
  return Response.json({ ok: true });
}
