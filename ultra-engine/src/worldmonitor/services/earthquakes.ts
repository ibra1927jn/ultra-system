import {
  SeismologyServiceClient,
  type Earthquake,
  type ListEarthquakesResponse,
} from '@/generated/client/worldmonitor/seismology/v1/service_client';
import { createCircuitBreaker } from '@/utils';

// Re-export the proto Earthquake type as the domain's public type
export type { Earthquake };

const client = new SeismologyServiceClient('', { fetch: (...args) => globalThis.fetch(...args) });
const breaker = createCircuitBreaker<ListEarthquakesResponse>({ name: 'Seismology' });

const emptyFallback: ListEarthquakesResponse = { earthquakes: [] };

export async function fetchEarthquakes(): Promise<Earthquake[]> {
  const response = await breaker.execute(async () => {
    return client.listEarthquakes({ minMagnitude: 0 });
  }, emptyFallback);
  return response.earthquakes;
}

// ════════════════════════════════════════════════════════════
//  Direct USGS GeoJSON path — used by ultra-engine bridge
//
//  The proto-based fetchEarthquakes() above relies on
//  SeismologyServiceClient which is a Phase 1 stub without backend.
//  This direct path hits USGS public GeoJSON feed
//  (https://earthquake.usgs.gov/earthquakes/feed/v1.0) — no key, no
//  relay, no gRPC. Used by ultra-engine/src/wm_bridge.js
//  runEarthquakesJob.
//
//  Returns a flat shape suitable for direct DB persistence and signal
//  aggregator ingestion. Different from the proto Earthquake type, which
//  remains for the (currently unused) gRPC path.
// ════════════════════════════════════════════════════════════

export interface UsgsEarthquake {
  id: string;
  magnitude: number;
  place: string;
  eventTime: Date;
  depthKm: number;
  lat: number;
  lon: number;
  eventType: string;
  alertLevel?: string;
  tsunami: boolean;
  felt?: number;
  cdi?: number;
  mmi?: number;
  significance?: number;
  url?: string;
  raw: unknown;
}

const USGS_FEED_BASE = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';

/**
 * Fetch the USGS earthquakes feed directly. Magnitude defaults to 4.5
 * (significant), period defaults to 'day' (last 24 hours).
 *
 * Available magnitude prefixes: significant, 4.5, 2.5, 1.0, all
 * Available periods: hour, day, week, month
 */
export async function fetchEarthquakesFromUsgs(opts: {
  minMagnitude?: '4.5' | '2.5' | '1.0' | 'all' | 'significant';
  period?: 'hour' | 'day' | 'week' | 'month';
} = {}): Promise<UsgsEarthquake[]> {
  const minMag = opts.minMagnitude || '4.5';
  const period = opts.period || 'day';
  const url = `${USGS_FEED_BASE}/${minMag}_${period}.geojson`;

  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      console.warn(`[Earthquakes] USGS HTTP ${response.status}`);
      return [];
    }
    const data = await response.json() as {
      features: Array<{
        id: string;
        properties: {
          mag: number;
          place: string;
          time: number;
          type: string;
          alert?: string | null;
          tsunami?: number;
          felt?: number | null;
          cdi?: number | null;
          mmi?: number | null;
          sig?: number;
          url?: string;
        };
        geometry: { coordinates: [number, number, number] };  // [lon, lat, depth_km]
      }>;
    };

    const out: UsgsEarthquake[] = [];
    for (const f of data.features || []) {
      const p = f.properties;
      const g = f.geometry;
      if (!g || !Array.isArray(g.coordinates) || g.coordinates.length < 2) continue;
      out.push({
        id: f.id,
        magnitude: Number(p.mag),
        place: p.place || '',
        eventTime: new Date(p.time),
        depthKm: Number(g.coordinates[2] || 0),
        lat: Number(g.coordinates[1]),
        lon: Number(g.coordinates[0]),
        eventType: p.type || 'earthquake',
        alertLevel: p.alert || undefined,
        tsunami: Boolean(p.tsunami),
        felt: p.felt ?? undefined,
        cdi: p.cdi ?? undefined,
        mmi: p.mmi ?? undefined,
        significance: p.sig ?? undefined,
        url: p.url || undefined,
        raw: p,
      });
    }
    return out;
  } catch (err) {
    console.warn('[Earthquakes] USGS fetch error:', (err as Error).message);
    return [];
  }
}
