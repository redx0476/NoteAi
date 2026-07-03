// Shared bot_jobs helpers used by the /api/bots routes and calendar sync.

const { fmtTs } = require('../meetings');

const MEET_RE = /https?:\/\/meet\.google\.com\/[a-z]{3}-?[a-z]{4}-?[a-z]{3}/i;
const TEAMS_RE = /https?:\/\/teams\.(microsoft\.com\/l\/meetup-join|live\.com\/meet)\/\S+/i;

/** 'meet' | 'teams' | null for a pasted/extracted meeting URL. */
function detectPlatform(url) {
  if (MEET_RE.test(url || '')) return 'meet';
  if (TEAMS_RE.test(url || '')) return 'teams';
  return null;
}

/** Extract the first Meet/Teams link from free text (calendar fields). */
function extractMeetingUrl(text) {
  if (!text) return null;
  const meet = text.match(MEET_RE);
  if (meet) return meet[0];
  const teams = text.match(TEAMS_RE);
  if (teams) return teams[0];
  return null;
}

function serializeJob(j) {
  return {
    id: j.id,
    meetingId: j.meeting_id,
    meetingUrl: j.meeting_url,
    platform: j.platform,
    status: j.status,
    scheduledAt: fmtTs(j.scheduled_at),
    calendarEventId: j.calendar_event_id,
    eventTitle: j.event_title,
    error: j.error,
    createdAt: fmtTs(j.created_at),
    startedAt: fmtTs(j.started_at),
    endedAt: fmtTs(j.ended_at),
  };
}

module.exports = { detectPlatform, extractMeetingUrl, serializeJob, MEET_RE, TEAMS_RE };
