// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 5 Sub-D — Commercial vessels (AISStream fan-out)
//
//  Parallel track to military-vessels.ts. The aisstream_subscriber.js
//  WebSocket runner fans each AIS message out to BOTH
//  military-vessels.processAisPosition (existing) AND this module's
//  processCommercialAisPosition (new). Each module owns its own
//  in-memory state map; military stays untouched.
//
//  Filter: AIS ship type 70-89 (cargo + tanker) seen inside any of the
//  chokepoint bboxes the subscriber subscribes to. Other commercial
//  ship types (fishing/passenger/special craft) are dropped to keep
//  the dataset focused on freight + energy logistics.
//
//  State: trackedCommercialVessels map keyed by MMSI. Cleanup runs
//  every COMMERCIAL_HISTORY_CLEANUP_INTERVAL and drops vessels last
//  seen more than COMMERCIAL_VESSEL_STALE_TIME ago.
//
//  Snapshot path: ultra-engine/src/wm_bridge.js → runCommercialVesselsJob
//  pulls the current map values and persists to wm_commercial_vessels.
// ════════════════════════════════════════════════════════════

export interface AisPositionData {
  mmsi: string;
  name: string;
  lat: number;
  lon: number;
  shipType?: number;
  heading?: number;
  speed?: number;
  course?: number;
}

export interface CommercialVessel {
  mmsi: string;
  name: string | null;
  aisShipType: number;
  aisShipTypeName: string;
  category: 'cargo' | 'tanker' | 'other';
  flagCountry: string | null;
  lat: number;
  lon: number;
  heading: number | null;
  speed: number | null;
  course: number | null;
  destination: string | null;
  nearChokepoint: string | null;
  lastUpdate: Date;
}

// Commercial chokepoint bboxes — must mirror what aisstream_subscriber.js
// subscribes to so vessels we receive are guaranteed to be inside one.
// Format: { name, lamin, lamax, lomin, lomax }.
const COMMERCIAL_CHOKEPOINTS: Array<{ name: string; lamin: number; lamax: number; lomin: number; lomax: number }> = [
  { name: 'Strait of Hormuz',          lamin: 25.0, lamax: 28.0, lomin: 55.0, lomax: 58.0 },
  { name: 'Bab el-Mandeb',             lamin: 11.0, lamax: 14.0, lomin: 42.0, lomax: 45.0 },
  { name: 'Suez Canal',                lamin: 29.0, lamax: 31.0, lomin: 31.5, lomax: 33.5 },
  { name: 'Taiwan Strait',             lamin: 23.0, lamax: 26.0, lomin: 118.0, lomax: 121.0 },
  { name: 'Eastern Mediterranean',     lamin: 32.5, lamax: 36.5, lomin: 31.0, lomax: 35.0 },
  { name: 'Black Sea (Crimea/Odessa)', lamin: 42.5, lamax: 46.5, lomin: 31.5, lomax: 35.5 },
];

function getNearbyCommercialChokepoint(lat: number, lon: number): string | null {
  for (const c of COMMERCIAL_CHOKEPOINTS) {
    if (lat >= c.lamin && lat <= c.lamax && lon >= c.lomin && lon <= c.lomax) {
      return c.name;
    }
  }
  return null;
}

// AIS ship type code → human-readable name (just enough for cargo/tanker).
function getAisShipTypeName(t: number): string {
  if (t >= 70 && t <= 79) return 'Cargo';
  if (t >= 80 && t <= 89) return 'Tanker';
  if (t >= 60 && t <= 69) return 'Passenger';
  if (t >= 50 && t <= 59) return 'Special Craft';
  if (t === 30) return 'Fishing';
  if (t >= 31 && t <= 34) return 'Towing/Diving';
  return `Type ${t}`;
}

function categorize(t: number): 'cargo' | 'tanker' | 'other' {
  if (t >= 70 && t <= 79) return 'cargo';
  if (t >= 80 && t <= 89) return 'tanker';
  return 'other';
}

// MMSI MID (first 3 digits) → flag country. Only the most-trafficked
// flags relevant to commercial freight. Rest stay null.
const MID_TO_FLAG: Record<string, string> = {
  '538': 'Marshall Islands',
  '477': 'Hong Kong',
  '563': 'Singapore',
  '249': 'Malta',
  '636': 'Liberia',
  '352': 'Panama',
  '215': 'Cyprus',
  '309': 'Bahamas',
  '255': 'Madeira',
  '477': 'Hong Kong',
  '413': 'China',
  '538': 'Marshall Islands',
  '566': 'Singapore',
  '725': 'Chile',
  '244': 'Netherlands',
  '235': 'United Kingdom',
  '211': 'Germany',
  '227': 'France',
  '247': 'Italy',
  '224': 'Spain',
  '316': 'Canada',
  '366': 'United States',
  '367': 'United States',
  '432': 'Japan',
  '440': 'South Korea',
  '525': 'Indonesia',
  '533': 'Malaysia',
  '419': 'India',
  '432': 'Japan',
};

function flagFromMmsi(mmsi: string): string | null {
  const mid = mmsi.slice(0, 3);
  return MID_TO_FLAG[mid] || null;
}

// ─── Module state ───────────────────────────────────────────────────
const trackedCommercialVessels = new Map<string, CommercialVessel>();
let messageCount = 0;
let isTracking = false;

const COMMERCIAL_VESSEL_STALE_TIME = 4 * 60 * 60 * 1000;        // 4h
const COMMERCIAL_HISTORY_CLEANUP_INTERVAL = 10 * 60 * 1000;     // 10min
const MAX_TRACKED = 5000;

/**
 * Process one AIS message — same shape that the subscriber feeds into
 * military-vessels.processAisPosition. We filter independently to
 * commercial cargo/tanker and ignore everything else.
 *
 * Note: a single AIS message often lacks shipType (PositionReport
 * messages don't carry it; only ShipStaticData does). We gracefully
 * accept updates for already-tracked MMSIs without shipType — the
 * static data message will eventually arrive and seed the type, then
 * subsequent position updates refine the lat/lon.
 */
export function processCommercialAisPosition(data: AisPositionData): void {
  const { mmsi, lat, lon } = data;
  if (!mmsi || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const existing = trackedCommercialVessels.get(mmsi);

  // If we don't already track this MMSI we MUST have a shipType to
  // categorize it. Otherwise drop the message.
  let shipType = data.shipType;
  if (existing) {
    if (typeof shipType !== 'number') shipType = existing.aisShipType;
  } else {
    if (typeof shipType !== 'number') return;
    if (!(shipType >= 70 && shipType <= 89)) return;             // cargo/tanker only
  }

  if (!(shipType >= 70 && shipType <= 89)) return;

  messageCount++;

  // Bound the map size — drop oldest entries when full.
  if (!existing && trackedCommercialVessels.size >= MAX_TRACKED) {
    let oldestMmsi: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of trackedCommercialVessels) {
      const t = v.lastUpdate.getTime();
      if (t < oldestTime) { oldestTime = t; oldestMmsi = k; }
    }
    if (oldestMmsi) trackedCommercialVessels.delete(oldestMmsi);
  }

  const nearChokepoint = getNearbyCommercialChokepoint(lat, lon);

  const vessel: CommercialVessel = {
    mmsi,
    name: (data.name || existing?.name || '').trim() || null,
    aisShipType: shipType,
    aisShipTypeName: getAisShipTypeName(shipType),
    category: categorize(shipType),
    flagCountry: existing?.flagCountry || flagFromMmsi(mmsi),
    lat,
    lon,
    heading: typeof data.heading === 'number' ? data.heading : (existing?.heading ?? null),
    speed: typeof data.speed === 'number' ? data.speed : (existing?.speed ?? null),
    course: typeof data.course === 'number' ? data.course : (existing?.course ?? null),
    destination: existing?.destination || null,
    nearChokepoint: nearChokepoint || existing?.nearChokepoint || null,
    lastUpdate: new Date(),
  };

  trackedCommercialVessels.set(mmsi, vessel);
  isTracking = true;
}

/**
 * Drop vessels we haven't heard from in COMMERCIAL_VESSEL_STALE_TIME.
 * Called periodically by setInterval (registered on first import in
 * the Node runtime via the bottom of this file).
 */
function cleanup(): void {
  const cutoff = Date.now() - COMMERCIAL_VESSEL_STALE_TIME;
  for (const [mmsi, v] of trackedCommercialVessels) {
    if (v.lastUpdate.getTime() < cutoff) {
      trackedCommercialVessels.delete(mmsi);
    }
  }
}

/**
 * Snapshot all currently tracked commercial vessels. Returns a copy
 * of the in-memory map values. Used by wm_bridge.js
 * runCommercialVesselsJob to persist to wm_commercial_vessels.
 */
export function getTrackedCommercialVessels(): CommercialVessel[] {
  return Array.from(trackedCommercialVessels.values());
}

export function getCommercialVesselStatus(): { tracking: boolean; vessels: number; messages: number } {
  return {
    tracking: isTracking,
    vessels: trackedCommercialVessels.size,
    messages: messageCount,
  };
}

// Register cleanup interval on import. We intentionally do NOT gate
// this on `typeof window !== 'undefined'` (military-vessels.ts does
// that for browser code) — this module is Node-only.
const cleanupHandle = setInterval(cleanup, COMMERCIAL_HISTORY_CLEANUP_INTERVAL);
// Allow Node to exit if this is the only thing keeping the loop alive
if (typeof (cleanupHandle as { unref?: () => void }).unref === 'function') {
  (cleanupHandle as { unref?: () => void }).unref!();
}
