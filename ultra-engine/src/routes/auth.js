// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Auth Routes                              ║
// ║  POST /api/auth/login — JWT login                       ║
// ║  GET  /api/auth/me    — Current user info               ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, requireAuth, setSessionCookie, clearSessionCookie } = require('../middleware/jwt-auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email and password required' });
  }

  const user = await db.queryOne('SELECT id, email, password_hash FROM auth_users WHERE email = $1', [email]);

  if (!user || !await bcrypt.compare(password, user.password_hash)) {
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  }

  const token = generateToken(user.id, user.email);
  // Set httpOnly cookie for dashboard auto-auth
  setSessionCookie(res, token);
  res.json({ ok: true, token, email: user.email });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await db.queryOne('SELECT id, email FROM auth_users WHERE id = $1', [req.userId]);
  if (!user) {
    return res.status(404).json({ ok: false, error: 'User not found' });
  }
  res.json({ ok: true, id: user.id, email: user.email });
});

module.exports = router;
