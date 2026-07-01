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
