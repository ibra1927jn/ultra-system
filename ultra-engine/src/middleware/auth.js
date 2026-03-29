// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Middleware de autenticacion              ║
// ║  API Key para requests externos                          ║
// ║  Dashboard (mismo origen) pasa sin key                   ║
// ╚══════════════════════════════════════════════════════════╝

const crypto = require('crypto');

function apiKeyAuth(req, res, next) {
  const serverKey = process.env.API_KEY;

  if (!serverKey) {
    console.error('API_KEY no configurada en variables de entorno');
    return res.status(503).json({ ok: false, error: 'Server misconfigured: API_KEY not set' });
  }

  // Dashboard (mismo origen) pasa sin key — verificacion estricta
  const referer = req.headers.referer || req.headers.origin || '';
  const host = req.headers.host || '';
  const isDashboard = referer && (
    referer.startsWith(`http://${host}`) ||
    referer.startsWith(`https://${host}`)
  );

  if (isDashboard) {
    return next();
  }

  // Requests externos requieren API key via header solamente
  const clientKey = req.headers['x-api-key'];

  if (!clientKey) {
    return res.status(401).json({ ok: false, error: 'Missing API key. Use header X-API-Key' });
  }

  if (clientKey.length !== serverKey.length || !timingSafeEqual(clientKey, serverKey)) {
    return res.status(403).json({ ok: false, error: 'Invalid API key' });
  }

  next();
}

function timingSafeEqual(a, b) {
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = { apiKeyAuth };
