// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 5 Sub-B — Cloudflare Radar internet outages
//
//  Cloudflare Radar API exposes a curated stream of internet outage
//  annotations: country-level shutdowns (Iran, Pakistan, Sudan, …),
//  network-level fiber cuts, technical outages, and government-
//  directed throttling. This is the canonical free source for
//  geopolitical-grade connectivity disruption signal.
//
//  Endpoint: GET https://api.cloudflare.com/client/v4/radar/annotations/outages
//  Auth: Bearer CLOUDFLARE_RADAR_TOKEN (Radar Read scope)
//  Docs: https://developers.cloudflare.com/api/operations/radar-get-annotations-outages
//
//  Strategy:
//   - Pull dateRange=30d (Cloudflare's max for this endpoint).
//   - Each annotation has stable id; UPSERT (source_id) keeps the
//     row up to date as outages transition from ongoing → ended.
//
//  Used by ultra-engine/src/wm_bridge.js → runCloudflareRadarOutagesJob.
// ════════════════════════════════════════════════════════════

const RADAR_BASE = 'https://api.cloudflare.com/client/v4/radar/annotations/outages';
const FETCH_TIMEOUT_MS = 20_000;

export interface OutageRow {
  sourceId: string;
  outageType: string | null;
  scope: string | null;            // 'country' | 'network' | null
  locationCode: string | null;
  locationName: string | null;
  asn: string | null;
  asnName: string | null;
  eventType: string | null;
  description: string | null;
  linkUrl: string | null;
  startDate: string;               // ISO 8601
  endDate: string | null;          // ISO 8601 or null = ongoing
  isOngoing: boolean;
  raw: unknown;
}

interface RadarAnnotation {
  id?: string;
  asns?: number[];
  asnsDetails?: Array<{ asn?: string; name?: string; locations?: { code?: string; name?: string } }>;
  dataSource?: string;
  description?: string;
  endDate?: string | null;
  eventType?: string;
  linkedUrl?: string;
  locations?: string[];
  locationsDetails?: Array<{ code?: string; name?: string }>;
  outage?: { outageCause?: string; outageType?: string };
  scope?: string;
  startDate?: string;
}

interface RadarApiResponse {
  success?: boolean;
  errors?: unknown[];
  result?: {
    annotations?: RadarAnnotation[];
  };
}

function pickLocation(a: RadarAnnotation): { code: string | null; name: string | null } {
  if (a.locationsDetails && a.locationsDetails.length > 0) {
    const first = a.locationsDetails[0];
    if (first) return { code: first.code || null, name: first.name || null };
  }
  if (a.locations && a.locations.length > 0) {
    return { code: a.locations[0] || null, name: null };
  }
  return { code: null, name: null };
}

function pickAsn(a: RadarAnnotation): { asn: string | null; asnName: string | null } {
  if (a.asnsDetails && a.asnsDetails.length > 0) {
    const first = a.asnsDetails[0];
    if (first) return { asn: first.asn || null, asnName: first.name || null };
  }
  if (a.asns && a.asns.length > 0) {
    return { asn: String(a.asns[0]), asnName: null };
  }
  return { asn: null, asnName: null };
}

/**
 * Fetch outage annotations from Cloudflare Radar (last 30d window).
 *
 * Returns OutageRow[] suitable for persistInternetOutages in wm_bridge.js.
 * Throws on auth/HTTP errors so the bridge runner can flag the job as
 * errored — empty result with success=true returns []
 */
export async function fetchAllInternetOutages(token: string): Promise<OutageRow[]> {
  if (!token) throw new Error('CLOUDFLARE_RADAR_TOKEN missing');

  const params = new URLSearchParams({
    dateRange: '30d',
    limit: '500',
    format: 'json',
  });
  const url = `${RADAR_BASE}?${params.toString()}`;

  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'UltraSystem-WorldMonitor/1.0',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Cloudflare Radar HTTP ${r.status}: ${body.slice(0, 200)}`);
  }
  const j = (await r.json()) as RadarApiResponse;
  if (!j.success) {
    throw new Error(`Cloudflare Radar API errors: ${JSON.stringify(j.errors || []).slice(0, 200)}`);
  }
  const annotations = j.result?.annotations || [];
  const out: OutageRow[] = [];
  const now = Date.now();

  for (const a of annotations) {
    if (!a.id || !a.startDate) continue;
    const startMs = Date.parse(a.startDate);
    if (!Number.isFinite(startMs)) continue;
    const endMs = a.endDate ? Date.parse(a.endDate) : NaN;
    const isOngoing = !a.endDate || !Number.isFinite(endMs) || endMs > now;
    const loc = pickLocation(a);
    const asnInfo = pickAsn(a);

    out.push({
      sourceId: String(a.id),
      outageType: a.outage?.outageType || null,
      scope: a.scope || (asnInfo.asn ? 'network' : (loc.code ? 'country' : null)),
      locationCode: loc.code,
      locationName: loc.name,
      asn: asnInfo.asn,
      asnName: asnInfo.asnName,
      eventType: a.eventType || a.outage?.outageCause || null,
      description: a.description ? a.description.slice(0, 4000) : null,
      linkUrl: a.linkedUrl || null,
      startDate: new Date(startMs).toISOString(),
      endDate: a.endDate && Number.isFinite(endMs) ? new Date(endMs).toISOString() : null,
      isOngoing,
      raw: a,
    });
  }

  console.log(`[cf-radar] Returning ${out.length} outage annotations (30d window)`);
  return out;
}
