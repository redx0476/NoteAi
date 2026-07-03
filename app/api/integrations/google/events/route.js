import { randomUUID } from 'crypto';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { listUpcomingEvents } from '@/lib/calendar/google';
import { eventMeetingUrl } from '@/lib/calendar/sync';
import { detectPlatform } from '@/lib/bots/jobs';

export const dynamic = 'force-dynamic';

// Upcoming (24 h) calendar events merged with their bot-job status, so the UI
// can render per-event auto-join toggles.
export async function GET(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { rows } = await pool.query('SELECT * FROM calendar_accounts WHERE user_id = $1', [
    payload.uid,
  ]);
  const account = rows[0];
  if (!account) return Response.json({ error: 'Not connected' }, { status: 404 });

  let events;
  try {
    events = await listUpcomingEvents(account);
  } catch (err) {
    return Response.json({ error: 'Calendar fetch failed', detail: err.message }, { status: 502 });
  }

  const { rows: jobs } = await pool.query(
    `SELECT * FROM bot_jobs WHERE user_id = $1 AND calendar_event_id IS NOT NULL`,
    [payload.uid]
  );
  const jobByEvent = new Map(jobs.map((j) => [j.calendar_event_id, j]));

  const out = [];
  for (const ev of events) {
    if (ev.status === 'cancelled') continue;
    const url = eventMeetingUrl(ev);
    const platform = detectPlatform(url || '');
    const start = ev.start?.dateTime || ev.start?.date;
    if (!start) continue;
    const job = jobByEvent.get(ev.id);
    out.push({
      eventId: ev.id,
      title: ev.summary || '(no title)',
      start,
      meetingUrl: url,
      platform,
      joinable: !!(url && platform && ev.start?.dateTime),
      botStatus: job?.status || null,
      botJobId: job?.id || null,
      enabled: job ? job.status !== 'skipped' : !!(url && platform && ev.start?.dateTime),
    });
  }
  return Response.json(out);
}

// Flip auto-join for one event: scheduled <-> skipped.
export async function PATCH(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { eventId, enabled, meetingUrl, start, title } =
    (await request.json().catch(() => ({}))) || {};
  if (!eventId) return Response.json({ error: 'eventId required' }, { status: 400 });

  const { rows } = await pool.query(
    'SELECT * FROM bot_jobs WHERE user_id = $1 AND calendar_event_id = $2',
    [payload.uid, eventId]
  );
  const job = rows[0];

  if (job) {
    if (['scheduled', 'skipped'].includes(job.status)) {
      await pool.query('UPDATE bot_jobs SET status = $1, updated_at = now() WHERE id = $2', [
        enabled ? 'scheduled' : 'skipped',
        job.id,
      ]);
    }
    return Response.json({ ok: true });
  }

  // No job yet (poller hasn't run, or the event was previously unjoinable):
  // create one directly in the requested state.
  const platform = detectPlatform(meetingUrl || '');
  if (!platform || !start) {
    return Response.json({ error: 'Event has no joinable meeting link' }, { status: 400 });
  }
  await pool.query(
    `INSERT INTO bot_jobs (id, user_id, meeting_url, platform, status, scheduled_at, calendar_event_id, event_title)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, calendar_event_id) WHERE calendar_event_id IS NOT NULL DO NOTHING`,
    [
      randomUUID(),
      payload.uid,
      meetingUrl,
      platform,
      enabled ? 'scheduled' : 'skipped',
      new Date(start),
      eventId,
      title || null,
    ]
  );
  return Response.json({ ok: true });
}
