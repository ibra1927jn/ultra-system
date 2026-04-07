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

// ════════════════════════════════════════════════════════════
//  P6 FASE 3d — Public read-only endpoints for map.html
//  Mount como /api/public/* en server.js
//  Sin JWT pero solo expone endpoints view-only seguros
// ════════════════════════════════════════════════════════════

router.get('/poi/campsites.geojson', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, name, poi_type, latitude, longitude, country, is_free, has_water, has_dump, has_shower, source
       FROM log_pois
       WHERE poi_type='campsite' AND latitude IS NOT NULL AND longitude IS NOT NULL
       LIMIT 5000`
    );
    const features = rows.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(r.longitude), parseFloat(r.latitude)] },
      properties: {
        id: r.id, name: r.name, type: r.poi_type, free: r.is_free,
        water: r.has_water, dump: r.has_dump, shower: r.has_shower, source: r.source,
      },
    }));
    res.set('Content-Type', 'application/geo+json');
    res.json({ type: 'FeatureCollection', count: features.length, features });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/gps/last', async (req, res) => {
  try {
    const row = await db.queryOne(
      `SELECT device_id, lat, lon, speed_kmh, fix_time, altitude
       FROM log_gps_positions ORDER BY fix_time DESC LIMIT 1`
    );
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/route', async (req, res) => {
  try {
    const routing = require('../routing');
    const { from, to } = req.body;
    if (!from?.lat || !from?.lon || !to?.lat || !to?.lon) {
      return res.status(400).json({ ok: false, error: 'from{lat,lon} y to{lat,lon} requeridos' });
    }
    const r = await routing.routeOSRM(from, to, 'driving');
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/trip', async (req, res) => {
  try {
    const routing = require('../routing');
    const { waypoints } = req.body;
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ ok: false, error: 'waypoints array (≥2) requerido' });
    }
    const r = await routing.tripOSRM(waypoints, {});
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
//  P7 FASE 4 — Wearable bridge (generic ingest)
//  Accepts pings from Gadgetbridge/Mi Band/GPSLogger/OwnTracks/
//  Apple Health/Google Fit/Fitbit/Oura/Garmin via simple POST.
//
//  Format flexible:
//   POST /webhooks/wearable
//   { device_id, device_type, metrics: [
//       { type: 'steps', value: 10234, unit: 'count', at: '2026-04-07T15:30:00Z' },
//       { type: 'heart_rate', value: 72, unit: 'bpm', at: '...' },
//       { type: 'sleep', value: 7.5, unit: 'hours', at: '...' },
//       { type: 'hrv', value: 45, unit: 'ms', at: '...' },
//   ]}
//
//  Persists to bio_wearable_raw + auto-aggregates daily into bio_checks.
// ════════════════════════════════════════════════════════════

router.post('/wearable', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    const payload = req.body || {};
    const deviceId = String(payload.device_id || payload.deviceId || 'unknown');
    const deviceType = payload.device_type || payload.deviceType || 'unknown';
    const metrics = payload.metrics || (payload.metric ? [payload.metric] : [payload]);

    let inserted = 0;
    for (const m of (Array.isArray(metrics) ? metrics : [])) {
      const metricType = m.type || m.metric_type || m.metricType;
      const value = m.value;
      const unit = m.unit || null;
      const at = m.at || m.measured_at || m.timestamp || new Date().toISOString();
      if (!metricType || value === undefined) continue;

      const isNumeric = typeof value === 'number' || !isNaN(parseFloat(value));
      await db.query(
        `INSERT INTO bio_wearable_raw
         (device_id, device_type, metric_type, value_numeric, value_text, unit, measured_at, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          deviceId, deviceType, metricType,
          isNumeric ? parseFloat(value) : null,
          !isNumeric ? String(value).slice(0, 500) : null,
          unit, new Date(at), JSON.stringify(m),
        ]
      );
      inserted++;
    }

    res.json({ ok: true, inserted, device: deviceId });
  } catch (err) {
    console.error('webhook /wearable error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /webhooks/wearable/recent ─ Last 50 pings (debug) ──
router.get('/wearable/recent', async (req, res) => {
  if (!verifySecret(req, res)) return;
  try {
    const rows = await db.queryAll(
      `SELECT device_id, device_type, metric_type, value_numeric, value_text, unit, measured_at
       FROM bio_wearable_raw ORDER BY measured_at DESC LIMIT 50`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
