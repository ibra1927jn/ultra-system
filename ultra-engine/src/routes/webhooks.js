// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Webhooks públicos (sin JWT)              ║
// ║                                                            ║
// ║  Endpoints invocados por servicios externos que no pueden ║
// ║  emitir JWT. SOLO accesibles desde la red interna         ║
// ║  ultra_net (no expuestos al puerto 80 público porque      ║
// ║  el reverse proxy bloquea /webhook por defecto).          ║
// ║                                                            ║
// ║  Defensa adicional: validar shared secret en query string.║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const eventbus = require('../eventbus');
const telegram = require('../telegram');

const router = express.Router();

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

function verifySecret(req, res) {
  if (!WEBHOOK_SECRET) return true; // sin secret configurado → acepta (red interna)
  if (req.query.secret === WEBHOOK_SECRET) return true;
  res.status(401).json({ ok: false, error: 'Invalid secret' });
  return false;
}

// ─── POST /webhooks/changedetection ──────────────────────
// Recibe payload Apprise/JSON de changedetection.io cuando
// detecta cambio en una página gov.
router.post('/changedetection', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    const payload = req.body || {};
    const cdioUuid = payload.uuid || payload.watch_uuid || payload.watch_url || null;
    const summary = payload.message || payload.title || payload.diff_full || payload.diff || '';

    let watchId = null;
    if (cdioUuid) {
      const w = await db.queryOne(
        `SELECT id FROM bur_gov_watches WHERE cdio_uuid = $1`,
        [cdioUuid]
      );
      watchId = w?.id || null;
    }

    await db.query(
      `INSERT INTO bur_gov_changes (watch_id, cdio_uuid, diff_summary, payload)
       VALUES ($1,$2,$3,$4)`,
      [watchId, cdioUuid, String(summary).slice(0, 500), JSON.stringify(payload)]
    );

    if (watchId) {
      await db.query(
        `UPDATE bur_gov_watches SET last_changed_at = NOW() WHERE id = $1`,
        [watchId]
      );
    }

    // Publica evento (persiste en event_log + notifica suscriptores in-memory)
    await eventbus.publish('bur.gov_change_detected', 'P4', {
      watch_id: watchId, cdio_uuid: cdioUuid,
      summary: String(summary).slice(0, 200),
    });

    // Telegram alert directo (la página gov ha cambiado)
    if (watchId) {
      const w = await db.queryOne(
        `SELECT label, url, country, category FROM bur_gov_watches WHERE id = $1`,
        [watchId]
      );
      if (w && telegram.alertGovChange) {
        await telegram.alertGovChange(w, summary);
      }
    }

    res.json({ ok: true, watch_id: watchId });
  } catch (err) {
    console.error('❌ cdio webhook error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET/POST /webhooks/gps ─ OsmAnd protocol direct push ──
// Phone Traccar Client puede apuntar aquí en vez de a ultra_traccar:5055.
// Soporta GET (Traccar Client default) y POST (OwnTracks-style).
// Params OsmAnd: id, lat, lon, timestamp, hdop, altitude, speed, bearing
async function ingestGps(payload) {
  const lat = parseFloat(payload.lat || payload.latitude);
  const lon = parseFloat(payload.lon || payload.longitude || payload.lng);
  if (isNaN(lat) || isNaN(lon)) throw new Error('lat/lon required');

  const fixTime = payload.timestamp
    ? (Number.isFinite(+payload.timestamp) ? new Date(+payload.timestamp * 1000) : new Date(payload.timestamp))
    : new Date();

  await db.query(
    `INSERT INTO log_gps_positions
       (device_id, lat, lon, altitude, speed_kmh, accuracy_m, bearing, fix_time, source, raw)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'osmand_direct',$9)`,
    [
      String(payload.id || payload.device_id || 'unknown'),
      lat, lon,
      payload.altitude ? parseFloat(payload.altitude) : null,
      payload.speed ? parseFloat(payload.speed) : null,
      payload.hdop ? parseFloat(payload.hdop) : (payload.accuracy ? parseFloat(payload.accuracy) : null),
      payload.bearing ? parseFloat(payload.bearing) : null,
      fixTime,
      JSON.stringify(payload),
    ]
  );

  // Update log_devices last_seen
  if (payload.id) {
    await db.query(
      `INSERT INTO log_devices (device_id, last_seen, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (device_id) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
      [String(payload.id), fixTime]
    );
  }
}

router.get('/gps', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    await ingestGps(req.query);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post('/gps', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    await ingestGps(req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

module.exports = router;
