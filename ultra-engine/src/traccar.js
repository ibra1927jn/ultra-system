// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Traccar GPS bridge (P6 Fase 2)           ║
// ║                                                            ║
// ║  Talks to ultra_traccar:8082 REST API. Default admin/admin║
// ║  hasta que el usuario cambie credentials.                  ║
// ║                                                            ║
// ║  Pull pattern: poll Traccar /api/positions periódicamente ║
// ║  y persiste a log_gps_positions. Alternativa: configurar  ║
// ║  Traccar webhook → /webhooks/traccar (push pattern).      ║
// ║                                                            ║
// ║  Phone setup: instalar Traccar Client iOS/Android,        ║
// ║  configurar URL http://95.217.158.7:5055 protocolo OsmAnd. ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const BASE_URL = process.env.TRACCAR_BASE_URL || 'http://traccar:8082';
const USER = process.env.TRACCAR_USER || 'admin';
const PASS = process.env.TRACCAR_PASS || 'admin';

function authHeader() {
  const token = Buffer.from(`${USER}:${PASS}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

async function isReachable() {
  try {
    const r = await fetch(`${BASE_URL}/api/server`, { headers: authHeader() });
    return r.ok;
  } catch { return false; }
}

async function getDevices() {
  const r = await fetch(`${BASE_URL}/api/devices`, { headers: authHeader() });
  if (!r.ok) throw new Error(`Traccar devices ${r.status}`);
  return r.json();
}

async function getPositions({ deviceId, from, to } = {}) {
  const params = new URLSearchParams();
  if (deviceId) params.set('deviceId', deviceId);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const url = `${BASE_URL}/api/positions${params.toString() ? '?' + params : ''}`;
  const r = await fetch(url, { headers: authHeader() });
  if (!r.ok) throw new Error(`Traccar positions ${r.status}`);
  return r.json();
}

/**
 * Pull recent positions desde Traccar y persiste a log_gps_positions.
 * Idempotente: solo inserta si fix_time + device_id no existen ya.
 */
async function syncPositions() {
  if (!(await isReachable())) {
    return { ok: false, error: 'Traccar no reachable' };
  }

  const devices = await getDevices();
  let upsertedDevices = 0;
  for (const d of devices) {
    await db.query(
      `INSERT INTO log_devices (device_id, name, type, last_seen, is_active)
       VALUES ($1,$2,'gps_phone',$3,TRUE)
       ON CONFLICT (device_id) DO UPDATE SET name=EXCLUDED.name, last_seen=EXCLUDED.last_seen`,
      [String(d.id), d.name, d.lastUpdate]
    );
    upsertedDevices++;
  }

  // Pull positions for each device — Traccar /api/positions devuelve "última" por device
  let inserted = 0;
  for (const d of devices) {
    try {
      const positions = await getPositions({ deviceId: d.id });
      for (const p of positions) {
        const result = await db.query(
          `INSERT INTO log_gps_positions
            (device_id, lat, lon, altitude, speed_kmh, accuracy_m, bearing, fix_time, source, raw)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'traccar',$9)
           ON CONFLICT DO NOTHING`,
          [
            String(d.id),
            p.latitude, p.longitude,
            p.altitude || null,
            p.speed != null ? p.speed * 1.852 : null,  // knots → kmh
            p.accuracy || null,
            p.course || null,
            p.fixTime || p.deviceTime,
            JSON.stringify(p),
          ]
        );
        if (result.rowCount > 0) inserted++;
      }
    } catch (err) {
      console.warn(`traccar device ${d.id} positions failed:`, err.message);
    }
  }

  return { ok: true, devices: upsertedDevices, positions_inserted: inserted };
}

/**
 * Última posición conocida (last seen) para current location.
 */
async function getLastPosition(deviceId) {
  const where = deviceId ? 'WHERE device_id = $1' : '';
  const params = deviceId ? [deviceId] : [];
  return await db.queryOne(
    `SELECT device_id, lat, lon, speed_kmh, fix_time, altitude
     FROM log_gps_positions ${where}
     ORDER BY fix_time DESC LIMIT 1`,
    params
  );
}

module.exports = {
  isReachable,
  getDevices,
  getPositions,
  syncPositions,
  getLastPosition,
};
