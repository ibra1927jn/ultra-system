// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — changedetection.io client (P4 Fase 2)    ║
// ║                                                            ║
// ║  Talks to ghcr.io/dgtlmoon/changedetection.io REST API.   ║
// ║  https://changedetection.io/docs/api_v1/index.html        ║
// ║                                                            ║
// ║  No auth por defecto (instancia local en ultra_net).      ║
// ║  Si CDIO_API_KEY existe en .env → header x-api-key.       ║
// ║                                                            ║
// ║  Función: sincronizar bur_gov_watches con cdio. Idempotent.║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const BASE_URL = process.env.CDIO_BASE_URL || 'http://changedetection:5000';
const API_KEY = process.env.CDIO_API_KEY || '';

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (API_KEY) h['x-api-key'] = API_KEY;
  return h;
}

async function isReachable() {
  try {
    const r = await fetch(`${BASE_URL}/api/v1/systeminfo`, { headers: headers() });
    return r.ok;
  } catch { return false; }
}

async function listWatches() {
  const r = await fetch(`${BASE_URL}/api/v1/watch`, { headers: headers() });
  if (!r.ok) throw new Error(`cdio list failed: ${r.status}`);
  return r.json();
}

/**
 * Crea un watch en cdio. Devuelve el UUID generado.
 * notification_urls usa formato apprise: post://engine:3000/api/...
 */
async function createWatch(url, label, notification = null) {
  const body = {
    url,
    title: label,
    tag: 'gov',
  };
  if (notification) {
    body.notification_urls = [notification];
  }
  const r = await fetch(`${BASE_URL}/api/v1/watch`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`cdio create failed: ${r.status} ${text}`);
  }
  const data = await r.json();
  return data.uuid || data;
}

async function deleteWatch(uuid) {
  const r = await fetch(`${BASE_URL}/api/v1/watch/${uuid}`, {
    method: 'DELETE',
    headers: headers(),
  });
  return r.ok;
}

/**
 * Sincroniza bur_gov_watches → changedetection.io.
 * Crea cualquier watch local que no tenga cdio_uuid.
 * No borra los huérfanos en cdio (defensivo).
 *
 * Notification webhook apunta a engine en la red interna ultra_net.
 */
async function syncWatches() {
  const reachable = await isReachable();
  if (!reachable) {
    return { ok: false, error: 'changedetection.io no alcanzable en ' + BASE_URL };
  }

  const local = await db.queryAll(
    `SELECT id, label, url, cdio_uuid FROM bur_gov_watches WHERE is_active = TRUE`
  );

  // Apprise json:// URL → POST JSON al engine en red interna ultra_net.
  // routes/webhooks.js procesa el payload (sin JWT, validado por WEBHOOK_SECRET opcional).
  const secretQuery = process.env.WEBHOOK_SECRET ? `?secret=${process.env.WEBHOOK_SECRET}` : '';
  const notify = `json://engine:3000/webhooks/changedetection${secretQuery}`;

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const w of local) {
    if (w.cdio_uuid) {
      skipped++;
      continue;
    }
    try {
      const uuid = await createWatch(w.url, w.label, notify);
      await db.query(
        `UPDATE bur_gov_watches SET cdio_uuid = $1 WHERE id = $2`,
        [uuid, w.id]
      );
      created++;
    } catch (err) {
      errors.push({ id: w.id, label: w.label, error: err.message });
    }
  }

  return { ok: true, total: local.length, created, skipped, errors };
}

module.exports = {
  isReachable,
  listWatches,
  createWatch,
  deleteWatch,
  syncWatches,
};
