import jwt from 'jsonwebtoken';
import { pool } from '@/lib/db';
import { getTokens } from '@/lib/calendar/google';
import { syncAll } from '@/lib/calendar/sync';

export const dynamic = 'force-dynamic';

// OAuth redirect target. Verifies state, stores tokens, bounces back to the
// integrations page.
export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const fail = (reason) =>
    Response.redirect(new URL(`/app/integrations?error=${encodeURIComponent(reason)}`, url), 302);

  if (!code || !state) return fail('missing_code');

  let payload;
  try {
    payload = jwt.verify(state, process.env.JWT_SECRET || 'dev-insecure-secret');
  } catch {
    return fail('bad_state');
  }
  if (payload?.purpose !== 'gcal' || !payload.uid) return fail('bad_state');

  try {
    const { tokens, email } = await getTokens(code);
    if (!tokens.refresh_token) {
      // prompt=consent should always yield one; without it autopilot dies on expiry.
      return fail('no_refresh_token');
    }
    await pool.query(
      `INSERT INTO calendar_accounts (user_id, provider, email, access_token, refresh_token, token_expiry)
       VALUES ($1, 'google', $2, $3, $4, $5)
       ON CONFLICT (user_id)
       DO UPDATE SET email = EXCLUDED.email, access_token = EXCLUDED.access_token,
                     refresh_token = EXCLUDED.refresh_token, token_expiry = EXCLUDED.token_expiry,
                     autopilot = true`,
      [
        payload.uid,
        email,
        tokens.access_token || null,
        tokens.refresh_token,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      ]
    );
    // Populate upcoming meetings right away instead of waiting for the poller.
    syncAll().catch(() => {});
    return Response.redirect(new URL('/app/integrations?connected=1', url), 302);
  } catch (err) {
    console.error('calendar: oauth callback failed:', err.message);
    return fail('exchange_failed');
  }
}
