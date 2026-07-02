import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { signToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { email, password, name } = await request.json().catch(() => ({}));
  if (!email || !password || typeof password !== 'string' || password.length < 6 || password.length > 512) {
    return Response.json({ error: 'Email and a password (6–512 chars) are required' }, { status: 400 });
  }
  const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (exists.rows[0]) {
    return Response.json({ error: 'An account with that email already exists' }, { status: 409 });
  }

  const hash = bcrypt.hashSync(password, 10);
  const ins = await pool.query(
    'INSERT INTO users (email, name, password) VALUES ($1, $2, $3) RETURNING id',
    [email.toLowerCase(), name || null, hash]
  );

  const user = { id: ins.rows[0].id, email: email.toLowerCase(), name: name || null };
  return Response.json({ token: signToken(user), user });
}
