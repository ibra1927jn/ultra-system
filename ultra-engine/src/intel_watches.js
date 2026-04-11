// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — intel watches (P1 Lote A B5)              ║
// ║                                                            ║
// ║  Sincroniza intel_watches → changedetection.io.            ║
// ║  Tabla SEPARADA de bur_gov_watches (P4 burocracia personal)║
// ║  pero comparte el mismo container CDIO.                   ║
// ║                                                            ║
// ║  Diferencias vs changedetection.js:                       ║
// ║   - tag = 'intel' (no 'gov') para que CDIO los segregue   ║
// ║   - notification webhook → /webhooks/intel-watch          ║
// ║   - time_between_check derivado de check_interval_sec     ║
// ║     (policy 1h, country 3h)                               ║
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

// Convierte segundos al formato time_between_check de CDIO
function intervalSecToTbc(sec) {
  const total = Math.max(60, Number(sec) || 10800);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return { weeks: 0, days: 0, hours, minutes, seconds };
}

async function createWatch({ url, label, intervalSec, notification }) {
  const body = {
    url,
    title: label,
    tag: 'intel',
    time_between_check: intervalSecToTbc(intervalSec),
  };
  if (notification) body.notification_urls = [notification];

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

/**
 * Sincroniza intel_watches → changedetection.io.
 * Crea watches que aún no tengan cdio_uuid. Idempotente.
 * No borra huérfanos (defensivo, igual que el sync P4).
 */
async function syncIntelWatches() {
  const reachable = await isReachable();
  if (!reachable) {
    return { ok: false, error: 'changedetection.io no alcanzable en ' + BASE_URL };
  }

  const local = await db.queryAll(
    `SELECT id, label, url, check_interval_sec, cdio_uuid
     FROM intel_watches
     WHERE is_active = TRUE`
  );

  const secretQuery = process.env.WEBHOOK_SECRET ? `?secret=${process.env.WEBHOOK_SECRET}` : '';
  const notify = `json://engine:3000/webhooks/intel-watch${secretQuery}`;

  let created = 0;
  let skipped = 0;
  const errors = [];

  for (const w of local) {
    if (w.cdio_uuid) {
      skipped++;
      continue;
    }
    try {
      const uuid = await createWatch({
        url: w.url,
        label: w.label,
        intervalSec: w.check_interval_sec,
        notification: notify,
      });
      await db.query(
        `UPDATE intel_watches SET cdio_uuid = $1 WHERE id = $2`,
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
  createWatch,
  syncIntelWatches,
  intervalSecToTbc,
};
