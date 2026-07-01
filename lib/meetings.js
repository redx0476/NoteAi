// Shared meeting serialization + fetch helpers (Postgres). Used by the meeting
// API route handlers. JSONB columns come back already parsed by node-pg;
// TIMESTAMPTZ values are normalized to 'YYYY-MM-DD HH:MM:SS' (UTC) so the
// client's existing date formatting (which appends 'Z') keeps working.

const { pool } = require('./db');

function fmtTs(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

function serialize(m) {
  return {
    id: m.id,
    title: m.title,
    platform: m.platform,
    meetingUrl: m.meeting_url,
    status: m.status,
    summary: m.summary,
    actionItems: asArray(m.action_items),
    chapters: asArray(m.chapters),
    keywords: asArray(m.keywords),
    participants: asArray(m.participants),
    hasAudio: !!m.has_audio,
    startedAt: fmtTs(m.started_at),
    endedAt: fmtTs(m.ended_at),
  };
}

/** Full meeting (with transcript + highlights) scoped to a user, or null. */
async function getMeeting(id, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM meetings WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  const m = rows[0];
  if (!m) return null;

  const seg = await pool.query(
    'SELECT speaker, text, t_offset AS "tOffset", created_at FROM segments WHERE meeting_id = $1 ORDER BY id',
    [id]
  );
  const hl = await pool.query(
    'SELECT id, speaker, text, t_offset AS "tOffset", created_at FROM highlights WHERE meeting_id = $1 ORDER BY t_offset',
    [id]
  );

  const segments = seg.rows.map((s) => ({ ...s, created_at: fmtTs(s.created_at) }));
  const highlights = hl.rows.map((h) => ({ ...h, created_at: fmtTs(h.created_at) }));
  return { ...serialize(m), segments, highlights };
}

/** Confirm a meeting belongs to a user; returns the row id or null. */
async function ownsMeeting(id, userId) {
  const { rows } = await pool.query(
    'SELECT id FROM meetings WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows[0] || null;
}

module.exports = { serialize, getMeeting, ownsMeeting, fmtTs };
