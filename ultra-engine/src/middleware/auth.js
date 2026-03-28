// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Middleware de autenticación              ║
// ║  API Key simple via header o query param                 ║
// ╚══════════════════════════════════════════════════════════╝

/**
 * Middleware que valida API_KEY en cada request protegido.
 * Acepta el key en:
 *   - Header: x-api-key
 *   - Query param: ?api_key=...
 *
 * Si API_KEY no está definida en env, bloquea todo (fail-closed).
 */
function apiKeyAuth(req, res, next) {
  const serverKey = process.env.API_KEY;

  // Fail-closed: si no hay key configurada, rechazar todo
  if (!serverKey) {
    console.error('❌ API_KEY no configurada en variables de entorno');
    return res.status(503).json({
      ok: false,
      error: 'Server misconfigured: API_KEY not set',
    });
  }

  // Extraer key del header o query param
  const clientKey = req.headers['x-api-key'] || req.query.api_key;

  if (!clientKey) {
    return res.status(401).json({
      ok: false,
      error: 'Missing API key. Use header x-api-key or query param api_key',
    });
  }

  // Comparación en tiempo constante para evitar timing attacks
  if (clientKey.length !== serverKey.length || !timingSafeEqual(clientKey, serverKey)) {
    return res.status(403).json({
      ok: false,
      error: 'Invalid API key',
    });
  }

  next();
}

/**
 * Comparación en tiempo constante (evita timing attacks).
 * Usa crypto.timingSafeEqual si está disponible.
 */
function timingSafeEqual(a, b) {
  try {
    const crypto = require('crypto');
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    // Fallback manual si los buffers tienen distinto tamaño (no debería pasar)
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}

module.exports = { apiKeyAuth };
