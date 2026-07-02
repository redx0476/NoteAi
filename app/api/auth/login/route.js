import bcrypt from 'bcryptjs';
import { pool } from '@/lib/db';
import { signToken } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const { email, password } = await request.json().catch(() => ({}));
  // Length cap before bcrypt: hashing arbitrarily long input is a cheap DoS.
  if (!email || !password || typeof password !== 'string' || password.length > 512) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  const { rows } = await pool.query('SELECT id, email, name, password FROM users WHERE email = $1', [
    email.toLowerCase(),
  ]);
  const user = rows[0];
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return Response.json({ error: 'Invalid email or password' }, { status: 401 });
  }
  return Response.json({
    token: signToken(user),
    user: { id: user.id, email: user.email, name: user.name },
  });
}
