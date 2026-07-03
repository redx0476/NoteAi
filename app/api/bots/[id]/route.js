import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { serializeJob } from '@/lib/bots/jobs';

export const dynamic = 'force-dynamic';

async function ownJob(id, userId) {
  const { rows } = await pool.query('SELECT * FROM bot_jobs WHERE id = $1 AND user_id = $2', [
    id,
    userId,
  ]);
  return rows[0] || null;
}

export async function GET(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const job = await ownJob(params.id, payload.uid);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });
  return Response.json(serializeJob(job));
}

// Cancel a scheduled bot, or pull a live one out of its meeting.
export async function DELETE(request, { params }) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const job = await ownJob(params.id, payload.uid);
  if (!job) return Response.json({ error: 'Not found' }, { status: 404 });

  if (['scheduled', 'pending'].includes(job.status)) {
    await pool.query(
      `UPDATE bot_jobs SET status = 'skipped', updated_at = now() WHERE id = $1`,
      [params.id]
    );
    return Response.json({ ok: true, status: 'skipped' });
  }

  if (['joining', 'waiting_admission', 'recording'].includes(job.status)) {
    const manager = require('@/lib/bots/manager');
    const stopped = manager.stop(params.id); // runner marks the job ended itself
    if (!stopped) {
      // No live child (crash/restart) — close the row out directly.
      await pool.query(
        `UPDATE bot_jobs SET status = 'failed', error = 'no_live_process', updated_at = now() WHERE id = $1`,
        [params.id]
      );
    }
    return Response.json({ ok: true, status: stopped ? 'stopping' : 'failed' });
  }

  return Response.json({ ok: true, status: job.status });
}
