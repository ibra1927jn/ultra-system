import {
  WildfireServiceClient,
  type FireDetection,
  type FireConfidence,
  type ListFireDetectionsResponse,
} from '@/generated/client/worldmonitor/wildfire/v1/service_client';
import { createCircuitBreaker } from '@/utils';

export type { FireDetection };

// -- Types --

export interface FireRegionStats {
  region: string;
  fires: FireDetection[];
  fireCount: number;
  totalFrp: number;
  highIntensityCount: number;
}

export interface FetchResult {
  regions: Record<string, FireDetection[]>;
  totalCount: number;
  skipped?: boolean;
  reason?: string;
}

export interface MapFire {
  lat: number;
  lon: number;
  brightness: number;
  frp: number;
  confidence: number;
  region: string;
  acq_date: string;
  daynight: string;
}

// -- Client --

const client = new WildfireServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const breaker = createCircuitBreaker<ListFireDetectionsResponse>({ name: 'Wildfires' });

const emptyFallback: ListFireDetectionsResponse = { fireDetections: [] };

// -- Public API --

export async function fetchAllFires(_days?: number): Promise<FetchResult> {
  const response = await breaker.execute(async () => {
    return client.listFireDetections({});
  }, emptyFallback);
  const detections = response.fireDetections;

  if (detections.length === 0) {
    return { regions: {}, totalCount: 0, skipped: true, reason: 'NASA_FIRMS_API_KEY not configured' };
  }

  const regions: Record<string, FireDetection[]> = {};
  for (const d of detections) {
    const r = d.region || 'Unknown';
    (regions[r] ??= []).push(d);
  }

  return { regions, totalCount: detections.length };
}

export function computeRegionStats(regions: Record<string, FireDetection[]>): FireRegionStats[] {
  const stats: FireRegionStats[] = [];

  for (const [region, fires] of Object.entries(regions)) {
    const highIntensity = fires.filter(
      f => f.brightness > 360 && f.confidence === 'FIRE_CONFIDENCE_HIGH',
    );
    stats.push({
      region,
      fires,
      fireCount: fires.length,
      totalFrp: fires.reduce((sum, f) => sum + (f.frp || 0), 0),
      highIntensityCount: highIntensity.length,
    });
  }

  return stats.sort((a, b) => b.fireCount - a.fireCount);
}

export function flattenFires(regions: Record<string, FireDetection[]>): FireDetection[] {
  const all: FireDetection[] = [];
  for (const fires of Object.values(regions)) {
    for (const f of fires) {
      all.push(f);
    }
  }
  return all;
}

export function toMapFires(fires: FireDetection[]): MapFire[] {
  return fires.map(f => ({
    lat: f.location?.latitude ?? 0,
    lon: f.location?.longitude ?? 0,
    brightness: f.brightness,
    frp: f.frp,
    confidence: confidenceToNumber(f.confidence),
    region: f.region,
    acq_date: new Date(f.detectedAt).toISOString().slice(0, 10),
    daynight: f.dayNight,
  }));
}

function confidenceToNumber(c: FireConfidence): number {
  switch (c) {
    case 'FIRE_CONFIDENCE_HIGH': return 95;
    case 'FIRE_CONFIDENCE_NOMINAL': return 50;
    case 'FIRE_CONFIDENCE_LOW': return 20;
    default: return 0;
  }
}

// ════════════════════════════════════════════════════════════
//  Direct NASA FIRMS path — used by ultra-engine bridge
//
//  The proto-based fetchAllFires() above relies on
//  WildfireServiceClient which is a Phase 1 stub without backend.
//  This direct path hits the public NASA FIRMS area CSV API:
//  https://firms.modaps.eosdis.nasa.gov/api/area/csv/{KEY}/{SOURCE}/{AREA}/{DAY_RANGE}
//
//  Free MAP_KEY at https://firms.modaps.eosdis.nasa.gov/api/area/.
//  Limit: 1000 transactions / 10 min, well within our cron cadence.
//
//  Returns a flat shape compatible with signal-aggregator.ingestSatelliteFires.
// ════════════════════════════════════════════════════════════

export interface FirmsDetection {
  lat: number;
  lon: number;
  brightTi4: number;
  brightTi5: number;
  scan: number;
  track: number;
  acqDate: string;     // YYYY-MM-DD
  acqTime: string;     // HHMM
  satellite: string;   // 'N' (NOAA-20), 'S' (Suomi-NPP), 'A'/'T' (Aqua/Terra MODIS)
  instrument: string;  // 'VIIRS' or 'MODIS'
  confidence: string;  // 'l'/'n'/'h' for VIIRS, 0-100 for MODIS
  version: string;
  frp: number;         // Fire Radiative Power, MW
  daynight: string;    // 'D' or 'N'
}

const FIRMS_BASE = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

/**
 * Fetch FIRMS satellite fire detections for a bounding box.
 *
 *   source: 'VIIRS_SNPP_NRT' | 'VIIRS_NOAA20_NRT' | 'MODIS_NRT' | etc.
 *   area: '-180,-90,180,90' for global. Format: lonMin,latMin,lonMax,latMax.
 *   dayRange: 1-10 (days back from today).
 */
export async function fetchSatelliteFiresFromFirms(opts: {
  source?: string;
  area?: string;
  dayRange?: number;
} = {}): Promise<FirmsDetection[]> {
  const apiKey = (typeof process !== 'undefined' ? process.env : ({} as any)).NASA_FIRMS_MAP_KEY;
  if (!apiKey) {
    console.warn('[Wildfires] NASA_FIRMS_MAP_KEY not set, FIRMS direct path disabled');
    return [];
  }
  const source = opts.source || 'VIIRS_SNPP_NRT';
  const area = opts.area || '-180,-90,180,90';   // global
  const dayRange = Math.min(10, Math.max(1, opts.dayRange || 1));

  const url = `${FIRMS_BASE}/${apiKey}/${source}/${area}/${dayRange}`;

  try {
    const response = await fetch(url, { headers: { Accept: 'text/csv' } });
    if (!response.ok) {
      console.warn(`[Wildfires] FIRMS HTTP ${response.status}`);
      return [];
    }
    const text = await response.text();
    return parseFirmsCsv(text);
  } catch (err) {
    console.warn('[Wildfires] FIRMS fetch error:', (err as Error).message);
    return [];
  }
}

/**
 * Parse the NASA FIRMS CSV format. First row is the header.
 *
 * Header (VIIRS NRT):
 *   latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,
 *   instrument,confidence,version,bright_ti5,frp,daynight
 *
 * MODIS NRT has slightly different columns (brightness/track/etc).
 * We index by header name so both layouts work.
 */
function parseFirmsCsv(text: string): FirmsDetection[] {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const header = lines[0].split(',').map(h => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iLat = idx('latitude');
  const iLon = idx('longitude');
  const iBT4 = idx('bright_ti4');
  const iBT5 = idx('bright_ti5');
  const iScan = idx('scan');
  const iTrack = idx('track');
  const iDate = idx('acq_date');
  const iTime = idx('acq_time');
  const iSat = idx('satellite');
  const iIns = idx('instrument');
  const iConf = idx('confidence');
  const iVer = idx('version');
  const iFrp = idx('frp');
  const iDN = idx('daynight');

  if (iLat < 0 || iLon < 0 || iDate < 0) return [];

  const out: FirmsDetection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    if (cols.length < header.length) continue;
    const lat = Number(cols[iLat]);
    const lon = Number(cols[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    out.push({
      lat,
      lon,
      brightTi4: iBT4 >= 0 ? Number(cols[iBT4]) || 0 : 0,
      brightTi5: iBT5 >= 0 ? Number(cols[iBT5]) || 0 : 0,
      scan: iScan >= 0 ? Number(cols[iScan]) || 0 : 0,
      track: iTrack >= 0 ? Number(cols[iTrack]) || 0 : 0,
      acqDate: cols[iDate] || '',
      acqTime: iTime >= 0 ? String(cols[iTime] || '') : '',
      satellite: iSat >= 0 ? String(cols[iSat] || '') : '',
      instrument: iIns >= 0 ? String(cols[iIns] || '') : '',
      confidence: iConf >= 0 ? String(cols[iConf] || '') : '',
      version: iVer >= 0 ? String(cols[iVer] || '') : '',
      frp: iFrp >= 0 ? Number(cols[iFrp]) || 0 : 0,
      daynight: iDN >= 0 ? String(cols[iDN] || '') : '',
    });
  }
  return out;
}
