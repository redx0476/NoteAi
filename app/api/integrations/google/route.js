import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { calendarEnabled, revoke } from '@/lib/calendar/google';
import { fmtTs } from '@/lib/meetings';

export const dynamic = 'force-dynamic';

// Connection status for the integrations page.
export async function GET(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { rows } = await pool.query('SELECT * FROM calendar_accounts WHERE user_id = $1', [
    payload.uid,
  ]);
  const acc = rows[0];
  return Response.json({
    available: calendarEnabled(),
    connected: !!acc,
    email: acc?.email || null,
    autopilot: acc ? !!acc.autopilot : false,
    lastSyncedAt: fmtTs(acc?.last_synced_at),
  });
}

// Toggle autopilot (global auto-join on/off).
export async function PATCH(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { autopilot } = (await request.json().catch(() => ({}))) || {};
  const { rows } = await pool.query(
    'UPDATE calendar_accounts SET autopilot = $1 WHERE user_id = $2 RETURNING autopilot',
    [!!autopilot, payload.uid]
  );
  if (!rows[0]) return Response.json({ error: 'Not connected' }, { status: 404 });
  if (!autopilot) {
    // Autopilot off → cancel pending calendar-created jobs.
    await pool.query(
      `DELETE FROM bot_jobs WHERE user_id = $1 AND status = 'scheduled' AND calendar_event_id IS NOT NULL`,
      [payload.uid]
    );
  }
  return Response.json({ autopilot: rows[0].autopilot });
}

// Disconnect: revoke (best-effort), drop the account + scheduled calendar jobs.
export async function DELETE(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const { rows } = await pool.query('SELECT * FROM calendar_accounts WHERE user_id = $1', [
    payload.uid,
  ]);
  if (rows[0]) await revoke(rows[0]);
  await pool.query(
    `DELETE FROM bot_jobs WHERE user_id = $1 AND status IN ('scheduled','skipped') AND calendar_event_id IS NOT NULL`,
    [payload.uid]
  );
  await pool.query('DELETE FROM calendar_accounts WHERE user_id = $1', [payload.uid]);
  return Response.json({ ok: true });
}
