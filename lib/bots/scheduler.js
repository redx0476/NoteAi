// Dispatch loop for scheduled bot jobs (calendar auto-join + "send later").
//
// Every 30 s: promote `scheduled` jobs whose start time is within a minute to
// `pending` and spawn their runner; also run the overdue-bot watchdog.

const { pool } = require('../db');
const manager = require('./manager');

const TICK_MS = 30 * 1000;

let timer = null;

async function tick() {
  const { rows } = await pool
    .query(
      `UPDATE bot_jobs SET status = 'pending', updated_at = now()
       WHERE status = 'scheduled' AND scheduled_at <= now() + interval '1 minute'
       RETURNING id`
    )
    .catch((err) => {
      console.error('bots: scheduler query failed:', err.message);
      return { rows: [] };
    });

  for (const { id } of rows) {
    const ok = await manager.dispatch(id).catch((err) => {
      console.error(`bots: dispatch of ${id} failed:`, err.message);
      return false;
    });
    // Capacity full → put it back so the next tick retries.
    if (!ok) {
      await pool
        .query(`UPDATE bot_jobs SET status = 'scheduled' WHERE id = $1 AND status = 'pending'`, [id])
        .catch(() => {});
    }
  }

  await manager.killOverdue();
}

function startScheduler() {
  if (timer) return;
  timer = setInterval(() => tick().catch((err) => console.error('bots: tick error:', err.message)), TICK_MS);
  timer.unref?.();
  console.log('bots: scheduler started');
}

module.exports = { startScheduler };
