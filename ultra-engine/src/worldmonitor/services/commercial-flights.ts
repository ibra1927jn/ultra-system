// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 5 Sub-D — Commercial flights (OpenSky)
//
//  Mirror image of military-flights.ts: same OpenSky /api/states/all
//  endpoint, same OAuth2 auth, but the bbox set covers commercial
//  airspace (NA / EU / APAC busy regions) and the filter EXCLUDES
//  military aircraft so wm_military_flights remains the canonical
//  store for those.
//
//  Filtering:
//   - Exclude flights matched by isKnownMilitaryHex / identifyByCallsign
//     so we don't double-count.
//   - Exclude on-ground rows (no operational signal).
//   - Sample MAX_PER_REGION rows per region to bound the snapshot
//     volume — random sampling preserves geographical distribution
//     without flooding the table.
//
//  Schedule budget: 5 regions × ~600 flights ≈ 3K rows/snapshot.
//  At 4 snapshots/h × 24h × 7d retention ≈ 2M rows max.
//
//  Used by ultra-engine/src/wm_bridge.js → runCommercialFlightsJob.
// ════════════════════════════════════════════════════════════

import { identifyByCallsign, isKnownMilitaryHex } from '@/config/military';

const OPENSKY_DIRECT_URL = 'https://opensky-network.org/api/states/all';
const OPENSKY_TOKEN_URL = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token';

const FETCH_TIMEOUT_MS = 25_000;
const MAX_PER_REGION = 600;            // sampled cap
const REGION_PAUSE_MS = 250;           // be polite to OpenSky between regions

const OPENSKY_CLIENT_ID = (typeof process !== 'undefined' ? process.env : ({} as any)).OPENSKY_CLIENT_ID || '';
const OPENSKY_CLIENT_SECRET = (typeof process !== 'undefined' ? process.env : ({} as any)).OPENSKY_CLIENT_SECRET || '';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getOAuthToken(): Promise<string | null> {
  if (!OPENSKY_CLIENT_ID || !OPENSKY_CLIENT_SECRET) return null;
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) return cachedToken.token;
  try {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: OPENSKY_CLIENT_ID,
      client_secret: OPENSKY_CLIENT_SECRET,
    });
    const resp = await fetch(OPENSKY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!resp.ok) {
      console.warn(`[commercial-flights] OAuth2 token HTTP ${resp.status}`);
      return null;
    }
    const data = (await resp.json()) as { access_token: string; expires_in: number };
    cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return cachedToken.token;
  } catch (err) {
    console.warn('[commercial-flights] OAuth2 token error:', (err as Error).message);
    return null;
  }
}

// Wide commercial-airspace bboxes — chosen to cover the highest-density
// flight corridors without overlapping the military hotspot bboxes used
// by military-flights.ts. lamin/lamax/lomin/lomax in degrees.
interface CommercialRegion {
  name: string;
  region: string;     // short tag stored in DB
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}

const COMMERCIAL_REGIONS: CommercialRegion[] = [
  { name: 'North America East', region: 'na', lamin: 25, lamax: 50, lomin: -100, lomax: -65 },
  { name: 'North America West', region: 'na', lamin: 30, lamax: 50, lomin: -130, lomax: -100 },
  { name: 'Europe Core',        region: 'eu', lamin: 35, lamax: 60, lomin: -10,  lomax: 30 },
  { name: 'East Asia',           region: 'apac', lamin: 20, lamax: 45, lomin: 100, lomax: 145 },
  { name: 'Southeast Asia',      region: 'apac', lamin: -10, lamax: 25, lomin: 95,  lomax: 130 },
  { name: 'Middle East',         region: 'mena', lamin: 15, lamax: 40, lomin: 30,  lomax: 60 },
];

// OpenSky state array indices (same as military-flights.ts).
type OpenSkyState = [
  string,        // 0: icao24
  string | null, // 1: callsign
  string,        // 2: origin_country
  number | null, // 3: time_position
  number,        // 4: last_contact
  number | null, // 5: longitude
  number | null, // 6: latitude
  number | null, // 7: baro_altitude (m)
  boolean,       // 8: on_ground
  number | null, // 9: velocity (m/s)
  number | null, // 10: true_track
  number | null, // 11: vertical_rate (m/s)
  number[] | null,
  number | null, // 13: geo_altitude
  string | null, // 14: squawk
  boolean,
  number
];

interface OpenSkyResponse {
  time?: number;
  states?: OpenSkyState[] | null;
}

export interface CommercialFlightRow {
  icao24: string;
  callsign: string | null;
  originCountry: string | null;
  lat: number;
  lon: number;
  altitudeFt: number | null;
  headingDeg: number | null;
  speedKt: number | null;
  verticalRateFpm: number | null;
  onGround: boolean;
  squawk: string | null;
  region: string;
}

function isMilitary(state: OpenSkyState): boolean {
  const callsign = (state[1] || '').trim();
  const icao24 = state[0];
  const originCountry = state[2];
  if (callsign && identifyByCallsign(callsign, originCountry)) return true;
  if (isKnownMilitaryHex(icao24)) return true;
  return false;
}

function parseStateRow(state: OpenSkyState, region: string): CommercialFlightRow | null {
  const lat = state[6];
  const lon = state[5];
  if (lat === null || lon === null) return null;
  if (state[8] === true) return null;        // on_ground = no signal
  if (isMilitary(state)) return null;        // covered by wm_military_flights

  const baroAlt = state[7];
  const velocity = state[9];
  const track = state[10];
  const vertRate = state[11];

  return {
    icao24: state[0].toLowerCase(),
    callsign: (state[1] || '').trim() || null,
    originCountry: state[2] || null,
    lat,
    lon,
    altitudeFt: typeof baroAlt === 'number' ? Math.round(baroAlt * 3.28084) : null,
    headingDeg: typeof track === 'number' ? track : null,
    speedKt: typeof velocity === 'number' ? Math.round(velocity * 1.94384) : null,
    verticalRateFpm: typeof vertRate === 'number' ? Math.round(vertRate * 196.85) : null,
    onGround: false,
    squawk: state[14] || null,
    region,
  };
}

async function fetchRegion(region: CommercialRegion, token: string): Promise<CommercialFlightRow[]> {
  const params = new URLSearchParams({
    lamin: String(region.lamin),
    lamax: String(region.lamax),
    lomin: String(region.lomin),
    lomax: String(region.lomax),
  });
  try {
    const r = await fetch(`${OPENSKY_DIRECT_URL}?${params.toString()}`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) {
      if (r.status === 401) cachedToken = null;
      console.warn(`[commercial-flights] OpenSky HTTP ${r.status} for ${region.name}`);
      return [];
    }
    const data = (await r.json()) as OpenSkyResponse;
    const states = data.states || [];
    const rows: CommercialFlightRow[] = [];
    for (const s of states) {
      const row = parseStateRow(s, region.region);
      if (row) rows.push(row);
    }
    // Random downsample to MAX_PER_REGION to bound storage
    if (rows.length > MAX_PER_REGION) {
      // Fisher-Yates partial shuffle for unbiased sample
      for (let i = 0; i < MAX_PER_REGION; i++) {
        const j = i + Math.floor(Math.random() * (rows.length - i));
        const tmp = rows[i]!;
        rows[i] = rows[j]!;
        rows[j] = tmp;
      }
      rows.length = MAX_PER_REGION;
    }
    return rows;
  } catch (err) {
    console.warn(`[commercial-flights] fetch error for ${region.name}:`, (err as Error).message);
    return [];
  }
}

/**
 * Fetch a commercial-flight snapshot across all regions, dedup by
 * icao24 (overlapping bboxes can return the same flight), and return
 * the rows for persist by wm_bridge.js.
 */
export async function fetchAllCommercialFlights(): Promise<CommercialFlightRow[]> {
  const token = await getOAuthToken();
  if (!token) {
    console.warn('[commercial-flights] OPENSKY_CLIENT_ID/SECRET not configured — skipping');
    return [];
  }

  const all: CommercialFlightRow[] = [];
  const seen = new Set<string>();

  for (const region of COMMERCIAL_REGIONS) {
    const rows = await fetchRegion(region, token);
    for (const r of rows) {
      if (seen.has(r.icao24)) continue;
      seen.add(r.icao24);
      all.push(r);
    }
    await new Promise((res) => setTimeout(res, REGION_PAUSE_MS));
  }

  console.log(`[commercial-flights] ${all.length} unique commercial flights across ${COMMERCIAL_REGIONS.length} regions`);
  return all;
}
