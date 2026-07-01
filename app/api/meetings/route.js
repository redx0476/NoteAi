import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { serialize, getMeeting } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

// List the signed-in user's meetings (with optional search).
export async function GET(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  let rows;
  if (q) {
    const like = `%${q}%`;
    ({ rows } = await pool.query(
      `SELECT DISTINCT m.* FROM meetings m
       LEFT JOIN segments s ON s.meeting_id = m.id
       WHERE m.user_id = $1
         AND (m.title ILIKE $2 OR m.summary ILIKE $2 OR s.text ILIKE $2)
       ORDER BY m.started_at DESC`,
      [payload.uid, like]
    ));
  } else {
    ({ rows } = await pool.query(
      'SELECT * FROM meetings WHERE user_id = $1 ORDER BY started_at DESC',
      [payload.uid]
    ));
  }
  return Response.json(rows.map(serialize));
}

// Create / start a meeting.
export async function POST(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { title, platform, meetingUrl } = (await request.json().catch(() => ({}))) || {};
  const id = randomUUID();
  await pool.query(
    `INSERT INTO meetings (id, user_id, title, platform, meeting_url)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, payload.uid, title || 'Untitled meeting', platform || 'manual', meetingUrl || null]
  );
  return Response.json(await getMeeting(id, payload.uid));
}
