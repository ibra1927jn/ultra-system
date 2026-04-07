// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Multi-channel notifications (P4)          ║
// ║                                                            ║
// ║  Wrapper sobre Apprise (https://github.com/caronc/apprise) ║
// ║  para enviar a 100+ servicios (Discord, Slack, ntfy,       ║
// ║  Pushover, Matrix, email, SMS, etc.).                      ║
// ║                                                            ║
// ║  Modo de uso: Apprise corre como sidecar HTTP container.   ║
// ║  Si APPRISE_URL está configurado, se postean notificaciones║
// ║  a su endpoint /notify/. Si no, fallback a Telegram.       ║
// ║                                                            ║
// ║  Para activar:                                              ║
// ║   1. Añadir servicio apprise al docker-compose.yml         ║
// ║      (ver docker-compose.yml comentario)                   ║
// ║   2. Set APPRISE_URL=http://apprise:8000 en .env           ║
// ║   3. Configurar URLs de destino vía POST /apprise/add      ║
// ╚══════════════════════════════════════════════════════════╝

const telegram = require('./telegram');

const APPRISE_URL = process.env.APPRISE_URL;
const APPRISE_KEY = process.env.APPRISE_KEY || 'ultra';

/**
 * Envía notificación al stack configurado.
 *   { title, body, type: 'info'|'success'|'warning'|'failure', tags? }
 *
 * Si APPRISE_URL está configurado, postea ahí. Si no, fallback a Telegram.
 */
async function notify({ title, body, type = 'info', tags = [] }) {
  // Fallback siempre disponible
  if (!APPRISE_URL) {
    return telegram.sendAlert(`*${title}*\n${body}`);
  }
  try {
    const r = await fetch(`${APPRISE_URL}/notify/${APPRISE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, type, tag: tags.join(',') }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Apprise HTTP ${r.status}`);
    return { ok: true, channel: 'apprise' };
  } catch (err) {
    // Fallback degradado
    console.warn('Apprise failed, falling back to Telegram:', err.message);
    return telegram.sendAlert(`*${title}*\n${body}`);
  }
}

module.exports = { notify };
