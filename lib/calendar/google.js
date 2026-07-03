// Google Calendar OAuth helpers (auto-join / autopilot).
//
// Requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET; the redirect URI is
// ${APP_URL}/api/integrations/google/callback (register it on the OAuth app).

const { google } = require('googleapis');
const { pool } = require('../db');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

function calendarEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function redirectUri() {
  const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  return `${base}/api/integrations/google/callback`;
}

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri()
  );
}

/** Consent-screen URL; state carries a signed JWT identifying the user. */
function authUrl(state) {
  return oauthClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // always get a refresh_token
    scope: SCOPES,
    state,
  });
}

/** Exchange the callback code for tokens + the account email. */
async function getTokens(code) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const { data } = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
  return { tokens, email: data.email || null };
}

/**
 * Authenticated client for a calendar_accounts row. Refreshed tokens are
 * persisted so the stored access token stays usable across restarts.
 */
function clientForAccount(account) {
  const client = oauthClient();
  client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.token_expiry ? new Date(account.token_expiry).getTime() : undefined,
  });
  client.on('tokens', (tokens) => {
    pool
      .query(
        `UPDATE calendar_accounts
         SET access_token = COALESCE($1, access_token),
             refresh_token = COALESCE($2, refresh_token),
             token_expiry = COALESCE($3, token_expiry)
         WHERE id = $4`,
        [
          tokens.access_token || null,
          tokens.refresh_token || null,
          tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          account.id,
        ]
      )
      .catch((err) => console.error('calendar: token persist failed:', err.message));
  });
  return client;
}

/** Upcoming events (next 24 h) for an account, as raw Google event objects. */
async function listUpcomingEvents(account) {
  const auth = clientForAccount(account);
  const calendar = google.calendar({ version: 'v3', auth });
  const now = new Date();
  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 50,
  });
  return data.items || [];
}

/** Best-effort revoke on disconnect. */
async function revoke(account) {
  try {
    await oauthClient().revokeToken(account.refresh_token);
  } catch {
    /* token may already be dead */
  }
}

module.exports = { calendarEnabled, authUrl, getTokens, clientForAccount, listUpcomingEvents, revoke, redirectUri };
