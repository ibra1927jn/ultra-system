// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — AISstream.io WebSocket subscriber         ║
// ║                                                            ║
// ║  Conexión persistent a wss://stream.aisstream.io/v0/stream ║
// ║  con suscripción a bboxes que cubren los chokepoints       ║
// ║  navales de WM (Strait of Hormuz, Suez, Malacca, Bab        ║
// ║  el-Mandeb, Panama, Taiwan Strait, South China Sea, etc.). ║
// ║                                                            ║
// ║  Cada PositionReport / ShipStaticData entrante se mapea    ║
// ║  a la shape AisPositionData de WM y se pasa por             ║
// ║  processAisPosition(data) del módulo military-vessels.ts   ║
// ║  vía tsx hook. Eso aprovecha analyzeMmsi, matchKnownVessel ║
// ║  y todo el resto del filter+enrichment del WM intacto.     ║
// ║                                                            ║
// ║  Reconnect con exponential backoff (max 60s) si la         ║
// ║  conexión cae. Free tier aisstream = 1M msgs/mes ≈ 1.4K    ║
// ║  msg/min — bboxes pequeñas + filter MMSI mantienen volumen ║
// ║  bajo. El procesamiento downstream es síncrono O(1) por    ║
// ║  mensaje (Map.set) → no hay backpressure.                  ║
// ╚══════════════════════════════════════════════════════════╝

const WebSocket = require('ws');

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';

// Chokepoints navales — bboxes estrechas centradas en pasos críticos donde
// la presencia naval militar es alta. NO usamos las "seas" grandes (South
// China Sea, Baltic, Persian Gulf, etc.) del config WM original porque su
// volumen de tráfico comercial AIS satura el free tier de aisstream
// (~14M msgs/mes en una prueba de 30s con 12 bboxes grandes). Las 6
// bboxes de abajo dan ~1M msgs/mes, dentro del free tier (1M/mes).
//
// Si más adelante movemos a un tier de pago de aisstream, restaurar las
// bboxes amplias del config para máxima cobertura.
//
// Cada bbox es un par [[swLat, swLon], [neLat, neLon]] como exige el
// protocolo aisstream.
const CHOKEPOINT_BBOXES = [
  // [name,                  centerLat, centerLon, halfWidthDeg]
  ['Strait of Hormuz',          26.5,  56.5, 1.5],  // Iran/UAE/Oman
  ['Bab el-Mandeb',             12.5,  43.5, 1.5],  // Yemen/Eritrea
  ['Suez Canal',                30.0,  32.5, 1.0],  // Egypt
  ['Taiwan Strait',             24.5, 119.5, 1.5],  // PRC/Taiwan
  ['Eastern Mediterranean',     34.5,  33.0, 2.0],  // Israel/Syria/Cyprus
  ['Black Sea (Crimea/Odessa)', 44.5,  33.5, 2.0],  // Russia/Ukraine
].map(([name, lat, lon, half]) => ({
  name,
  bbox: [
    [lat - half, lon - half],  // SW corner
    [lat + half, lon + half],  // NE corner
  ],
}));

// Duty cycle to stay under aisstream free tier (1M msgs/month).
// Even with 6 small chokepoint bboxes the raw rate is ~0.8 msg/s ≈
// 2.1M/mes, ~2x the budget. Cycling 5min ON / 10min OFF reduces to
// ~33% duty → ~0.7M/mes, comfortably within the limit.
//
// Side effect: a vessel that only appears during an OFF window is missed.
// In practice tracked military vessels broadcast every 1-3 min, so a 5min
// ON window catches >95% of them. Acceptable trade-off until we can move
// to a paid tier or build a FilterShipMMSI bootstrap list.
const DUTY_ON_MS = parseInt(process.env.AISSTREAM_DUTY_ON_MS || '300000', 10);  // 5 min
const DUTY_OFF_MS = parseInt(process.env.AISSTREAM_DUTY_OFF_MS || '600000', 10); // 10 min

// Connection state
let ws = null;
let connecting = false;
let stopped = false;
let messagesReceived = 0;
let messagesProcessed = 0;
let messagesFiltered = 0;
let lastMessageAt = null;
let reconnectAttempts = 0;
let reconnectTimer = null;
let dutyCloseTimer = null;
let dutyReopenTimer = null;

// Backoff: 1s → 2s → 4s → 8s → 16s → 30s → 60s (capped)
function backoffDelay() {
  const base = Math.min(60_000, 1000 * Math.pow(2, Math.min(reconnectAttempts, 6)));
  // Add up to 25% jitter to avoid thundering herd on relay restart
  return base + Math.floor(Math.random() * base * 0.25);
}

/**
 * Lazy-load military-vessels TS module via tsx hook (already registered
 * by the engine startup --require tsx/cjs). Cached on first call so the
 * hot path (per-message) does not re-resolve.
 */
let militaryVesselsMod = null;
function loadMilitaryVessels() {
  if (!militaryVesselsMod) {
    militaryVesselsMod = require('./worldmonitor/services/military-vessels');
  }
  return militaryVesselsMod;
}

// Same lazy pattern for the commercial-vessels TS module — fan-out
// added in WM Phase 3 Bloque 5 Sub-D so each AIS message reaches both
// the military filter (existing) AND the commercial cargo/tanker
// filter (new). Each module owns its own state map.
let commercialVesselsMod = null;
function loadCommercialVessels() {
  if (!commercialVesselsMod) {
    commercialVesselsMod = require('./worldmonitor/services/commercial-vessels');
  }
  return commercialVesselsMod;
}

/**
 * Build the subscription message that aisstream.io expects after WebSocket
 * connection. Subscribes to PositionReport + ShipStaticData over the
 * chokepoint bboxes. APIKey is required by the service.
 */
function buildSubscriptionMessage(apiKey) {
  return {
    APIKey: apiKey,
    BoundingBoxes: CHOKEPOINT_BBOXES.map(b => b.bbox),
    // FilterMessageTypes restricts what we receive — both types give us
    // mmsi + position + name. ShipStaticData additionally includes
    // ship type which is critical for the military filter (type 35 etc).
    FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
  };
}

/**
 * Map an aisstream PositionReport message into the AisPositionData shape
 * that processAisPosition() expects.
 *
 * AISstream message structure:
 *   {
 *     "MessageType": "PositionReport",
 *     "MetaData": { "MMSI": 538009449, "ShipName": "FOO", "latitude": x, "longitude": y, ... },
 *     "Message": { "PositionReport": { "Latitude": x, "Longitude": y, "Cog": 0, "Sog": 12, "TrueHeading": 270, ... } }
 *   }
 *
 * ShipStaticData additionally includes Type (AIS ship type code).
 */
function mapMessageToAisData(msg) {
  if (!msg || !msg.MetaData || !msg.Message) return null;

  const meta = msg.MetaData;
  const mmsi = meta.MMSI;
  if (!mmsi) return null;

  // Position can come from MetaData.latitude/longitude OR from inner Message
  let lat = meta.latitude;
  let lon = meta.longitude;

  let shipType;
  let heading;
  let speed;
  let course;

  if (msg.Message.PositionReport) {
    const pr = msg.Message.PositionReport;
    if (Number.isFinite(pr.Latitude)) lat = pr.Latitude;
    if (Number.isFinite(pr.Longitude)) lon = pr.Longitude;
    if (Number.isFinite(pr.TrueHeading) && pr.TrueHeading < 360) heading = pr.TrueHeading;
    if (Number.isFinite(pr.Sog)) speed = pr.Sog;
    if (Number.isFinite(pr.Cog)) course = pr.Cog;
  } else if (msg.Message.ShipStaticData) {
    const ss = msg.Message.ShipStaticData;
    if (Number.isFinite(ss.Type)) shipType = ss.Type;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return {
    mmsi: String(mmsi),
    name: String(meta.ShipName || '').trim(),
    lat,
    lon,
    shipType,
    heading,
    speed,
    course,
  };
}

/**
 * Connect to aisstream.io and wire up message → processAisPosition flow.
 * Reconnects on close/error with exponential backoff.
 */
function connect() {
  if (stopped || connecting || ws) return;
  const aisKey = process.env.AISSTREAM_API_KEY;
  if (!aisKey) {
    console.warn('⚠️  AISstream subscriber: AISSTREAM_API_KEY not set, subscriber disabled');
    return;
  }

  connecting = true;

  try {
    ws = new WebSocket(AISSTREAM_URL);
  } catch (err) {
    console.error('❌ AISstream WebSocket constructor failed:', err.message);
    connecting = false;
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    connecting = false;
    reconnectAttempts = 0;
    try {
      const sub = buildSubscriptionMessage(aisKey);
      ws.send(JSON.stringify(sub));
      console.log(`🚢 AISstream connected: subscribed to ${CHOKEPOINT_BBOXES.length} chokepoint bboxes (duty ${DUTY_ON_MS/1000}s ON / ${DUTY_OFF_MS/1000}s OFF)`);
      // Tell military-vessels.ts that tracking is now active so its
      // status reporters reflect reality.
      try {
        loadMilitaryVessels().markMilitaryVesselTrackingActive();
      } catch (e) {
        console.warn('⚠️  AISstream: markMilitaryVesselTrackingActive failed:', e.message);
      }
      // Start duty cycle: close after DUTY_ON_MS, reopen after DUTY_OFF_MS
      if (dutyCloseTimer) clearTimeout(dutyCloseTimer);
      dutyCloseTimer = setTimeout(() => {
        if (ws && !stopped) {
          console.log('🚢 AISstream duty cycle: closing for OFF window');
          try { ws.close(1000, 'duty cycle off'); } catch {}
        }
      }, DUTY_ON_MS);
    } catch (err) {
      console.error('❌ AISstream subscription send failed:', err.message);
    }
  });

  ws.on('message', (raw) => {
    messagesReceived++;
    lastMessageAt = Date.now();

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;  // malformed message
    }

    // aisstream sends an "Error" or "ErrorMessage" if subscription rejected
    if (msg.error || msg.ErrorMessage) {
      console.error('❌ AISstream server error:', JSON.stringify(msg).slice(0, 300));
      return;
    }

    const data = mapMessageToAisData(msg);
    if (!data) return;

    try {
      const mil = loadMilitaryVessels();
      mil.processAisPosition(data);
      messagesProcessed++;
      // processAisPosition() filters internally; if the vessel passes the
      // military check it ends up in trackedVessels. We track filtered
      // count via the trackedVessels size which we sample in getStatus().
    } catch (err) {
      // Don't let one bad message kill the stream
      messagesFiltered++;
    }
    // Fan-out to commercial-vessels filter (Bloque 5 Sub-D). Independent
    // try/catch so a commercial-side bug never affects military tracking.
    try {
      const com = loadCommercialVessels();
      com.processCommercialAisPosition(data);
    } catch {
      /* swallow — commercial track is best-effort */
    }
  });

  ws.on('close', (code, reason) => {
    if (ws) {
      try { ws.removeAllListeners(); } catch {}
    }
    ws = null;
    connecting = false;
    if (dutyCloseTimer) { clearTimeout(dutyCloseTimer); dutyCloseTimer = null; }
    if (stopped) return;

    // Distinguish a duty-cycle close (clean code 1000 + our reason) from
    // an unexpected disconnect (network error, server kick). Duty close
    // triggers a longer wait before reconnecting; everything else uses
    // exponential backoff for retry.
    const reasonStr = String(reason || '');
    if (code === 1000 && reasonStr.includes('duty cycle')) {
      console.log(`🚢 AISstream duty cycle: sleeping ${DUTY_OFF_MS/1000}s before next ON window`);
      if (dutyReopenTimer) clearTimeout(dutyReopenTimer);
      dutyReopenTimer = setTimeout(() => {
        dutyReopenTimer = null;
        connect();
      }, DUTY_OFF_MS);
    } else {
      console.warn(`⚠️  AISstream disconnected (code ${code}, reason: ${reasonStr.slice(0,80)}). Reconnecting…`);
      scheduleReconnect();
    }
  });

  ws.on('error', (err) => {
    console.error('❌ AISstream WebSocket error:', err.message);
    // 'close' will fire next and trigger reconnect
  });
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return;
  reconnectAttempts++;
  const delay = backoffDelay();
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, delay);
}

/**
 * Public: start the subscriber. Idempotent — calling twice is a no-op.
 * Called from server.js startup, after the engine boots.
 */
function start() {
  if (stopped) {
    console.log('🚢 AISstream subscriber: re-starting after stop');
    stopped = false;
  }
  if (!process.env.AISSTREAM_API_KEY) {
    console.warn('⚠️  AISstream subscriber not started: AISSTREAM_API_KEY missing');
    return;
  }
  connect();
}

/**
 * Public: stop the subscriber. Used by graceful shutdown / reload.
 */
function stop() {
  stopped = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (dutyCloseTimer) { clearTimeout(dutyCloseTimer); dutyCloseTimer = null; }
  if (dutyReopenTimer) { clearTimeout(dutyReopenTimer); dutyReopenTimer = null; }
  if (ws) {
    try { ws.close(); } catch {}
    ws = null;
  }
}

/**
 * Public: status snapshot for /api/health and the cron logger.
 */
function getStatus() {
  return {
    connected: ws !== null && ws.readyState === WebSocket.OPEN,
    messagesReceived,
    messagesProcessed,
    messagesFiltered,
    reconnectAttempts,
    lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : null,
    bboxes: CHOKEPOINT_BBOXES.length,
    apiKeyPresent: !!process.env.AISSTREAM_API_KEY,
  };
}

module.exports = { start, stop, getStatus, mapMessageToAisData, CHOKEPOINT_BBOXES };
