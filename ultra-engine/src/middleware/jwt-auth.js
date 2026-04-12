// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — JWT Authentication Middleware            ║
// ╚══════════════════════════════════════════════════════════╝

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const COOKIE_NAME = 'ultra_session';

function generateToken(userId, email) {
  return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Set httpOnly session cookie with JWT token.
 * Called after successful login.
 */
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

/**
 * Clear session cookie (logout).
 */
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Auth middleware: accepts JWT via Bearer header OR httpOnly cookie.
 * Dashboard uses cookie (set at login), API clients use Bearer header.
 */
function requireAuth(req, res, next) {
  let token = null;

  // Try Bearer header first (API clients)
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice(7);
  }

  // Fallback to cookie (dashboard)
  if (!token && req.cookies && req.cookies[COOKIE_NAME]) {
    token = req.cookies[COOKIE_NAME];
  }

  if (!token) {
    // If requesting HTML (browser navigation), redirect to login
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ ok: false, error: 'Missing authentication' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch {
    // If expired cookie, redirect to login
    if (req.headers.accept && req.headers.accept.includes('text/html')) {
      return res.redirect('/login.html');
    }
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

module.exports = { generateToken, requireAuth, setSessionCookie, clearSessionCookie, COOKIE_NAME };
