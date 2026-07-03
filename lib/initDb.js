// Creates the NOTEAI schema on boot (idempotent). Postgres port of the original
// SQLite schema: SERIAL ids, JSONB columns, BOOLEAN + TIMESTAMPTZ.

const { pool } = require('./db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  password    TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meetings (
  id           TEXT PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL DEFAULT 'Untitled meeting',
  platform     TEXT,
  meeting_url  TEXT,
  status       TEXT NOT NULL DEFAULT 'live',
  summary      TEXT,
  action_items JSONB,
  chapters     JSONB,
  keywords     JSONB,
  participants JSONB,
  has_audio    BOOLEAN NOT NULL DEFAULT false,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS segments (
  id          SERIAL PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id),
  speaker     TEXT NOT NULL DEFAULT 'Speaker',
  text        TEXT NOT NULL,
  t_offset    REAL NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS highlights (
  id          SERIAL PRIMARY KEY,
  meeting_id  TEXT NOT NULL REFERENCES meetings(id),
  speaker     TEXT,
  text        TEXT NOT NULL,
  t_offset    REAL NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meetings_user ON meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_segments_meeting ON segments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_highlights_meeting ON highlights(meeting_id);

-- Notetaker bot jobs: one row per attempt to send the bot into a meeting.
-- status: pending|scheduled|skipped|joining|waiting_admission|recording|ended|failed
CREATE TABLE IF NOT EXISTS bot_jobs (
  id                TEXT PRIMARY KEY,
  user_id           INTEGER NOT NULL REFERENCES users(id),
  meeting_id        TEXT REFERENCES meetings(id),
  meeting_url       TEXT NOT NULL,
  platform          TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  scheduled_at      TIMESTAMPTZ,
  calendar_event_id TEXT,
  event_title       TEXT,
  error             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at        TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_jobs_cal_event
  ON bot_jobs(user_id, calendar_event_id) WHERE calendar_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bot_jobs_user ON bot_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_bot_jobs_due ON bot_jobs(status, scheduled_at);

-- Google Calendar connections for auto-join (one per user).
CREATE TABLE IF NOT EXISTS calendar_accounts (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER UNIQUE NOT NULL REFERENCES users(id),
  provider       TEXT NOT NULL DEFAULT 'google',
  email          TEXT,
  access_token   TEXT,
  refresh_token  TEXT NOT NULL,
  token_expiry   TIMESTAMPTZ,
  autopilot      BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- S3 object key for the finalized recording (null → local data/audio/ file).
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS audio_object_key TEXT;

-- AI-extracted meeting objectives (array of strings).
ALTER TABLE meetings ADD COLUMN IF NOT EXISTS objectives JSONB;
`;

let initialized = null;

async function initDb() {
  if (initialized) return initialized;
  initialized = pool.query(SCHEMA).then(() => {
    // eslint-disable-next-line no-console
    console.log('NOTEAI database schema ready.');
  });
  return initialized;
}

module.exports = { initDb };
