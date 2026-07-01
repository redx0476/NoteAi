// JWT auth helpers. Tokens carry { uid, email }, signed with JWT_SECRET.
// Route handlers authenticate via a Bearer header OR a ?token= query param
// (the latter is needed for <audio> playback and WebSocket connections).

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-insecure-secret';

function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

/**
 * Resolve the authenticated user's JWT payload from a Next.js Request, or null.
 * Accepts `Authorization: Bearer <token>` or a `?token=` query parameter.
 */
function getUserFromRequest(request) {
  const header = request.headers.get('authorization') || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    try {
      token = new URL(request.url).searchParams.get('token');
    } catch {
      /* ignore */
    }
  }
  return token ? verifyToken(token) : null;
}

module.exports = { signToken, verifyToken, getUserFromRequest };
