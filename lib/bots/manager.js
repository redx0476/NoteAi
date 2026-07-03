// Notetaker bot process manager.
//
// Each dispatched bot_jobs row gets its own child process (`node bot/runner.js
// --job <id>`) driving a Playwright Chromium that joins the meeting and streams
// PCM back into /ws/ingest. The DB row is the source of truth for job state;
// this module only tracks live children so it can stop them and reap orphans.

const { spawn } = require('child_process');
const path = require('path');
const { pool } = require('../db');
const { signServiceToken } = require('../auth');

const MAX_CONCURRENT = parseInt(process.env.BOT_MAX_CONCURRENT || '3', 10);
const RUNNER = path.join(process.cwd(), 'bot', 'runner.js');

/** jobId -> ChildProcess */
const children = new Map();

const ACTIVE_STATUSES = ['pending', 'joining', 'waiting_admission', 'recording'];

async function setStatus(jobId, status, error) {
  await pool
    .query('UPDATE bot_jobs SET status = $1, error = $2, updated_at = now() WHERE id = $3', [
      status,
      error || null,
      jobId,
    ])
    .catch((err) => console.error('bots: failed to update job status:', err.message));
}

/**
 * Spawn the runner for a pending job. Returns false when at capacity or the
 * job is already running (the scheduler retries on its next tick).
 */
async function dispatch(jobId) {
  if (children.has(jobId)) return true;
  if (children.size >= MAX_CONCURRENT) {
    console.warn(`bots: at capacity (${children.size}/${MAX_CONCURRENT}), job ${jobId} waits`);
    return false;
  }

  const { rows } = await pool.query(
    `SELECT b.*, u.email FROM bot_jobs b JOIN users u ON u.id = b.user_id WHERE b.id = $1`,
    [jobId]
  );
  const job = rows[0];
  if (!job || !['pending', 'scheduled'].includes(job.status)) return false;

  const child = spawn(process.execPath, [RUNNER, '--job', jobId], {
    env: {
      ...process.env,
      BOT_TOKEN: signServiceToken(job.user_id, job.email),
      APP_URL: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  children.set(jobId, child);
  console.log(`bots: dispatched job ${jobId} (pid ${child.pid})`);

  child.on('exit', async (code) => {
    children.delete(jobId);
    if (code !== 0) {
      // The runner marks terminal states itself; this catches crashes.
      const { rows: r } = await pool
        .query('SELECT status FROM bot_jobs WHERE id = $1', [jobId])
        .catch(() => ({ rows: [] }));
      const status = r[0]?.status;
      if (status && !['ended', 'failed', 'skipped'].includes(status)) {
        await setStatus(jobId, 'failed', `runner exited with code ${code}`);
      }
    }
  });
  return true;
}

/** Ask a running bot to leave gracefully (runner traps SIGTERM). */
function stop(jobId) {
  const child = children.get(jobId);
  if (!child) return false;
  try {
    child.kill('SIGTERM');
  } catch {
    /* already gone */
  }
  return true;
}

function isRunning(jobId) {
  return children.has(jobId);
}

/**
 * Boot-time cleanup: jobs left in-flight by a previous server process have no
 * child anymore — mark them failed so the UI doesn't show ghost bots.
 */
async function reconcile() {
  await pool
    .query(
      `UPDATE bot_jobs SET status = 'failed', error = 'server_restart', updated_at = now()
       WHERE status IN ('pending', 'joining', 'waiting_admission', 'recording')`
    )
    .catch((err) => console.error('bots: reconcile failed:', err.message));
}

/** Kill children that outlived BOT_MAX_MINUTES (watchdog, called by scheduler). */
async function killOverdue() {
  const maxMin = parseInt(process.env.BOT_MAX_MINUTES || '120', 10);
  const { rows } = await pool
    .query(
      `SELECT id FROM bot_jobs
       WHERE status IN ('joining', 'waiting_admission', 'recording')
         AND started_at IS NOT NULL AND started_at < now() - ($1 || ' minutes')::interval`,
      [maxMin]
    )
    .catch(() => ({ rows: [] }));
  for (const { id } of rows) {
    console.warn(`bots: job ${id} exceeded ${maxMin} min — stopping`);
    stop(id);
  }
}

module.exports = { dispatch, stop, isRunning, reconcile, killOverdue };
