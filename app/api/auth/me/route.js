import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { fmtTs } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { rows } = await pool.query('SELECT id, email, name, created_at FROM users WHERE id = $1', [payload.uid]);
  const user = rows[0];
  if (user) user.created_at = fmtTs(user.created_at);
  return Response.json({ user });
}
