import jwt from 'jsonwebtoken';
import { getUserFromRequest } from '@/lib/auth';
import { calendarEnabled, authUrl } from '@/lib/calendar/google';

export const dynamic = 'force-dynamic';

// Returns the Google consent-screen URL. The state param is a short-lived JWT
// carrying the uid so the callback (which arrives without a Bearer header)
// can tie the tokens to the right user.
export async function GET(request) {
  const payload = getUserFromRequest(request);
  if (!payload) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  if (!calendarEnabled()) {
    return Response.json(
      { error: 'Google Calendar is not configured (set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)' },
      { status: 501 }
    );
  }
  const state = jwt.sign({ uid: payload.uid, purpose: 'gcal' }, process.env.JWT_SECRET || 'dev-insecure-secret', {
    expiresIn: '15m',
  });
  return Response.json({ url: authUrl(state) });
}
