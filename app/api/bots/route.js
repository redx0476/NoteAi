import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { detectPlatform, serializeJob } from '@/lib/bots/jobs';

export const dynamic = 'force-dynamic';

// List the caller's bot jobs (most recent first).
export async function GET(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const activeOnly = new URL(request.url).searchParams.get('active') === '1';
  const { rows } = await pool.query(
    `SELECT * FROM bot_jobs WHERE user_id = $1
     ${activeOnly ? `AND status IN ('pending','scheduled','joining','waiting_admission','recording')` : ''}
     ORDER BY created_at DESC LIMIT 50`,
    [payload.uid]
  );
  return Response.json(rows.map(serializeJob));
}

// Send the notetaker bot to a meeting URL (now, or at scheduledAt).
export async function POST(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { meetingUrl, scheduledAt } = (await request.json().catch(() => ({}))) || {};
  const url = String(meetingUrl || '').trim();
  const platform = detectPlatform(url);
  if (!platform) {
    return Response.json(
      { error: 'Paste a Google Meet or Microsoft Teams meeting link' },
      { status: 400 }
    );
  }

  const id = randomUUID();
  const when = scheduledAt ? new Date(scheduledAt) : null;
  const scheduled = when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now() + 60_000;

  const { rows } = await pool.query(
    `INSERT INTO bot_jobs (id, user_id, meeting_url, platform, status, scheduled_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, payload.uid, url, platform, scheduled ? 'scheduled' : 'pending', scheduled ? when : null]
  );

  if (!scheduled) {
    // Same process as the custom server → the manager can spawn directly.
    const manager = require('@/lib/bots/manager');
    const ok = await manager.dispatch(id).catch((err) => {
      console.error('bots: dispatch failed:', err.message);
      return false;
    });
    if (!ok) {
      await pool.query(
        `UPDATE bot_jobs SET status = 'failed', error = 'dispatch_failed_or_at_capacity' WHERE id = $1`,
        [id]
      );
      return Response.json({ error: 'Could not start the bot (at capacity?)' }, { status: 503 });
    }
  }

  return Response.json(serializeJob(rows[0]), { status: 201 });
}
