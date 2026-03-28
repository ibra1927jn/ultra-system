// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Middleware de autenticacion              ║
// ║  API Key para requests externos                          ║
// ║  Dashboard (mismo origen) puede leer sin key             ║
// ╚══════════════════════════════════════════════════════════╝

function apiKeyAuth(req, res, next) {
  const serverKey = process.env.API_KEY;

  if (!serverKey) {
    console.error('API_KEY no configurada en variables de entorno');
    return res.status(503).json({ ok: false, error: 'Server misconfigured: API_KEY not set' });
  }

  // Dashboard (mismo origen) puede hacer GET sin key
  const referer = req.headers.referer || req.headers.origin || '';
  const host = req.headers.host || '';
  const isDashboard = referer.includes(host) || !referer;

  if (isDashboard && req.method === 'GET') {
    return next();
  }

  // Requests externos y mutaciones requieren API key
  const clientKey = req.headers['x-api-key'] || req.query.api_key;

  if (!clientKey) {
    return res.status(401).json({ ok: false, error: 'Missing API key. Use header x-api-key or query param api_key' });
  }

  if (clientKey.length !== serverKey.length || !timingSafeEqual(clientKey, serverKey)) {
    return res.status(403).json({ ok: false, error: 'Invalid API key' });
  }

  next();
}

function timingSafeEqual(a, b) {
  try {
    const crypto = require('crypto');
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

module.exports = { apiKeyAuth };
