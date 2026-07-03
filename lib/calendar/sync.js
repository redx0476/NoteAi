// Calendar → bot_jobs sync (the OtterPilot autopilot loop).
//
// Every 5 minutes, for each connected account with autopilot on: list the next
// 24 h of events, extract Meet/Teams links, and upsert `scheduled` bot jobs
// keyed by (user_id, calendar_event_id). The 30-second bot scheduler
// (lib/bots/scheduler.js) then dispatches them when their start time arrives.
//
// Per-event opt-out is a job flipped to status='skipped' — the upsert never
// resurrects skipped or terminal rows. Jobs whose events vanished are removed.

const { randomUUID } = require('crypto');
const { pool } = require('../db');
const { calendarEnabled, listUpcomingEvents } = require('./google');
const { extractMeetingUrl, detectPlatform } = require('../bots/jobs');

const POLL_MS = 5 * 60 * 1000;

let timer = null;

/** Meeting URL for a Google event: conferenceData first, then location/description. */
function eventMeetingUrl(ev) {
  const entry = (ev.conferenceData?.entryPoints || []).find((e) => e.entryPointType === 'video');
  return (
    extractMeetingUrl(entry?.uri) ||
    extractMeetingUrl(ev.location) ||
    extractMeetingUrl(ev.description)
  );
}

function isDeclined(ev) {
  const self = (ev.attendees || []).find((a) => a.self);
  return self?.responseStatus === 'declined';
}

async function syncAccount(account) {
  const events = await listUpcomingEvents(account);
  const seenIds = [];

  for (const ev of events) {
    if (ev.status === 'cancelled' || isDeclined(ev)) continue;
    const url = eventMeetingUrl(ev);
    const platform = detectPlatform(url || '');
    const start = ev.start?.dateTime; // all-day events (date only) can't host a call
    if (!url || !platform || !start) continue;

    seenIds.push(ev.id);
    await pool.query(
      `INSERT INTO bot_jobs (id, user_id, meeting_url, platform, status, scheduled_at, calendar_event_id, event_title)
       VALUES ($1, $2, $3, $4, 'scheduled', $5, $6, $7)
       ON CONFLICT (user_id, calendar_event_id) WHERE calendar_event_id IS NOT NULL
       DO UPDATE SET meeting_url = EXCLUDED.meeting_url,
                     scheduled_at = EXCLUDED.scheduled_at,
                     event_title = EXCLUDED.event_title,
                     updated_at = now()
       WHERE bot_jobs.status = 'scheduled'`,
      [randomUUID(), account.user_id, url, platform, new Date(start), ev.id, ev.summary || null]
    );
  }

  // Drop scheduled jobs whose events disappeared from the window (cancelled,
  // moved beyond 24 h, or link removed). Skipped/terminal rows are kept.
  await pool.query(
    `DELETE FROM bot_jobs
     WHERE user_id = $1 AND status = 'scheduled' AND calendar_event_id IS NOT NULL
       AND scheduled_at < now() + interval '24 hours'
       AND NOT (calendar_event_id = ANY($2::text[]))`,
    [account.user_id, seenIds]
  );

  await pool.query('UPDATE calendar_accounts SET last_synced_at = now() WHERE id = $1', [
    account.id,
  ]);
}

async function syncAll() {
  const { rows } = await pool.query(
    `SELECT * FROM calendar_accounts WHERE autopilot = true AND provider = 'google'`
  );
  for (const account of rows) {
    await syncAccount(account).catch((err) =>
      console.error(`calendar: sync failed for user ${account.user_id}:`, err.message)
    );
  }
}

function startCalendarPoller() {
  if (!calendarEnabled()) {
    console.log('calendar: GOOGLE_CLIENT_ID/SECRET not set — auto-join disabled');
    return;
  }
  if (timer) return;
  timer = setInterval(() => syncAll().catch((err) => console.error('calendar: poll error:', err.message)), POLL_MS);
  timer.unref?.();
  // First pass shortly after boot (give initDb / listen a moment).
  setTimeout(() => syncAll().catch(() => {}), 10_000).unref?.();
  console.log('calendar: auto-join poller started');
}

module.exports = { startCalendarPoller, syncAll, syncAccount, eventMeetingUrl };
