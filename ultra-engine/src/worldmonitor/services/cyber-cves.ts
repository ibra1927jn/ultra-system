// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 5 Sub-A — Cyber CVEs (NIST NVD 2.0 + CISA KEV)
//
//  NIST NVD 2.0 API (https://services.nvd.nist.gov/rest/json/cves/2.0)
//  is the canonical CVE database. No auth required for low rate
//  (5 req/30s anon). Optional NVD_API_KEY raises to 50 req/30s.
//
//  CISA KEV catalog (https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json)
//  is a curated subset of ~1300 actively-exploited CVEs. We download
//  the whole feed each tick (cheap, ~1MB) and merge against the NVD
//  rows so the kev_flag stays current — CISA can add a CVE to KEV
//  long after NVD published it.
//
//  Strategy:
//   1. Pull CISA KEV catalog (full snapshot, ~1300 entries).
//   2. Pull NVD CVEs published in the last `daysWindow` (default 30d)
//      via /cves/2.0?pubStartDate=...&pubEndDate=... paginated
//      with resultsPerPage=2000 + startIndex.
//   3. Filter to cvss_score ≥ minCvss (default 7.0) OR kev_flag=true.
//   4. Map to CveRow shape consumed by ultra-engine/src/wm_bridge.js
//      → persistCyberCves → wm_cyber_cves.
//
//  Used by ultra-engine/src/wm_bridge.js → runCyberCvesJob.
// ════════════════════════════════════════════════════════════

const NVD_BASE = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
// Primary: cisagov GitHub mirror (Akamai 403s the official cisa.gov URL
// from non-browser clients consistently — verified 2026-04-09 from this
// Hetzner box). Fallback: official cisa.gov path with a browser UA, in
// case the GitHub mirror ever lags.
const KEV_URL_PRIMARY = 'https://raw.githubusercontent.com/cisagov/kev-data/main/known_exploited_vulnerabilities.json';
const KEV_URL_FALLBACK = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';
const PAGE_SIZE = 2000;
const FETCH_TIMEOUT_MS = 30_000;
const REQUEST_PAUSE_MS = 6_500; // anon rate limit ~5 req/30s

export interface CveRow {
  cveId: string;
  source: 'NVD';
  publishedAt: string;        // ISO 8601
  lastModified: string;       // ISO 8601
  cvssVersion: string | null; // 'v3.1' | 'v3.0' | 'v2'
  cvssScore: number | null;
  cvssSeverity: string | null;
  cvssVector: string | null;
  kevFlag: boolean;
  kevAddedDate: string | null;  // YYYY-MM-DD
  kevDueDate: string | null;
  vendors: string[];
  products: string[];
  cweIds: string[];
  description: string | null;
  referenceCount: number;
  raw: unknown;
}

// ─── CISA KEV catalog shape ───────────────────────────────────────
interface KevEntry {
  cveID: string;
  vendorProject?: string;
  product?: string;
  vulnerabilityName?: string;
  dateAdded?: string;
  shortDescription?: string;
  requiredAction?: string;
  dueDate?: string;
  knownRansomwareCampaignUse?: string;
  notes?: string;
}

interface KevCatalog {
  catalogVersion?: string;
  dateReleased?: string;
  count?: number;
  vulnerabilities?: KevEntry[];
}

interface KevIndex {
  flags: Map<string, { addedDate: string | null; dueDate: string | null }>;
  total: number;
}

async function fetchKevFromUrl(url: string): Promise<KevCatalog | null> {
  try {
    const r = await fetch(url, {
      headers: {
        Accept: 'application/json',
        // Browser-style UA for the cisa.gov fallback (Akamai blocks
        // anything that looks scripted). The GitHub mirror is happy
        // with anything but we send the same to keep it uniform.
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) UltraSystem-WorldMonitor/1.0',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) {
      console.warn(`[cyber-cves] KEV HTTP ${r.status} from ${url}`);
      return null;
    }
    return (await r.json()) as KevCatalog;
  } catch (err) {
    console.warn(`[cyber-cves] KEV fetch error from ${url}:`, (err as Error).message);
    return null;
  }
}

async function fetchKevCatalog(): Promise<KevIndex> {
  const flags = new Map<string, { addedDate: string | null; dueDate: string | null }>();
  let j = await fetchKevFromUrl(KEV_URL_PRIMARY);
  if (!j) j = await fetchKevFromUrl(KEV_URL_FALLBACK);
  if (!j) return { flags, total: 0 };

  for (const v of j.vulnerabilities || []) {
    if (!v.cveID) continue;
    flags.set(v.cveID.toUpperCase(), {
      addedDate: v.dateAdded || null,
      dueDate: v.dueDate || null,
    });
  }
  return { flags, total: flags.size };
}

// ─── NVD 2.0 raw response shapes (verified against API docs) ─────
interface NvdMetricCvssData {
  version?: string;
  baseScore?: number;
  baseSeverity?: string;
  vectorString?: string;
}

interface NvdMetricCvss {
  cvssData?: NvdMetricCvssData;
  baseScore?: number;
  baseSeverity?: string;
}

interface NvdCveDescription {
  lang?: string;
  value?: string;
}

interface NvdWeakness {
  description?: NvdCveDescription[];
}

interface NvdCpeMatch {
  criteria?: string;
  vulnerable?: boolean;
}

interface NvdConfigNode {
  cpeMatch?: NvdCpeMatch[];
}

interface NvdConfiguration {
  nodes?: NvdConfigNode[];
}

interface NvdCveItem {
  id: string;
  published: string;
  lastModified: string;
  vulnStatus?: string;
  descriptions?: NvdCveDescription[];
  metrics?: {
    cvssMetricV31?: NvdMetricCvss[];
    cvssMetricV30?: NvdMetricCvss[];
    cvssMetricV2?: NvdMetricCvss[];
  };
  weaknesses?: NvdWeakness[];
  configurations?: NvdConfiguration[];
  references?: Array<{ url?: string }>;
}

interface NvdResponse {
  resultsPerPage?: number;
  startIndex?: number;
  totalResults?: number;
  vulnerabilities?: Array<{ cve: NvdCveItem }>;
}

function pickCvss(item: NvdCveItem): {
  version: string | null;
  score: number | null;
  severity: string | null;
  vector: string | null;
} {
  const m = item.metrics || {};
  // Prefer v3.1 > v3.0 > v2
  const candidates = [
    { arr: m.cvssMetricV31, ver: 'v3.1' },
    { arr: m.cvssMetricV30, ver: 'v3.0' },
    { arr: m.cvssMetricV2, ver: 'v2' },
  ];
  for (const c of candidates) {
    const arr = c.arr;
    if (!arr || arr.length === 0) continue;
    const first = arr[0];
    if (!first) continue;
    const data = first.cvssData || {};
    const score = typeof data.baseScore === 'number' ? data.baseScore : (typeof first.baseScore === 'number' ? first.baseScore : null);
    if (score === null || !Number.isFinite(score)) continue;
    return {
      version: c.ver,
      score,
      severity: data.baseSeverity || first.baseSeverity || null,
      vector: data.vectorString || null,
    };
  }
  return { version: null, score: null, severity: null, vector: null };
}

function extractVendorsProducts(item: NvdCveItem): { vendors: string[]; products: string[] } {
  const vendors = new Set<string>();
  const products = new Set<string>();
  for (const cfg of item.configurations || []) {
    for (const node of cfg.nodes || []) {
      for (const cpe of node.cpeMatch || []) {
        // CPE 2.3: cpe:2.3:a:vendor:product:version:...
        if (!cpe.criteria) continue;
        const parts = cpe.criteria.split(':');
        if (parts.length >= 5) {
          const vendor = parts[3];
          const product = parts[4];
          if (vendor && vendor !== '*') vendors.add(vendor.toLowerCase());
          if (product && product !== '*') products.add(product.toLowerCase());
        }
      }
    }
  }
  return {
    vendors: Array.from(vendors).slice(0, 20),
    products: Array.from(products).slice(0, 20),
  };
}

function extractCwes(item: NvdCveItem): string[] {
  const cwes = new Set<string>();
  for (const w of item.weaknesses || []) {
    for (const d of w.description || []) {
      if (d.value && d.value.startsWith('CWE-')) {
        cwes.add(d.value);
      }
    }
  }
  return Array.from(cwes).slice(0, 10);
}

function extractDescription(item: NvdCveItem): string | null {
  for (const d of item.descriptions || []) {
    if (d.lang === 'en' && d.value) return d.value.slice(0, 4000);
  }
  return null;
}

async function fetchNvdPage(
  pubStart: string,
  pubEnd: string,
  startIndex: number,
  apiKey: string | null
): Promise<NvdResponse | null> {
  const params = new URLSearchParams({
    pubStartDate: pubStart,
    pubEndDate: pubEnd,
    resultsPerPage: String(PAGE_SIZE),
    startIndex: String(startIndex),
  });
  const url = `${NVD_BASE}?${params.toString()}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'UltraSystem-WorldMonitor/1.0',
  };
  if (apiKey) headers.apiKey = apiKey;
  try {
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!r.ok) {
      console.warn(`[cyber-cves] NVD HTTP ${r.status} startIndex=${startIndex}`);
      return null;
    }
    return (await r.json()) as NvdResponse;
  } catch (err) {
    console.warn(`[cyber-cves] NVD fetch error startIndex=${startIndex}:`, (err as Error).message);
    return null;
  }
}

/**
 * Fetch CVEs published in the last `daysWindow` days from NVD, merge
 * with the CISA KEV catalog, filter to cvss_score ≥ minCvss OR
 * kev_flag = true, and return CveRow[].
 */
export async function fetchAllCyberCves(options: {
  daysWindow?: number;
  minCvss?: number;
  apiKey?: string | null;
} = {}): Promise<CveRow[]> {
  const daysWindow = options.daysWindow ?? 30;
  const minCvss = options.minCvss ?? 7.0;
  const apiKey = options.apiKey || null;

  // 1. KEV catalog
  const kev = await fetchKevCatalog();
  console.log(`[cyber-cves] KEV catalog: ${kev.total} entries`);

  // 2. NVD published in last daysWindow days
  // NVD requires ISO-8601 with millisecond precision and UTC offset.
  // Window must be ≤ 120 days; we cap at 120 just in case.
  const window = Math.max(1, Math.min(120, daysWindow));
  const end = new Date();
  const start = new Date(end.getTime() - window * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
  const pubStart = fmt(start);
  const pubEnd = fmt(end);

  const out: CveRow[] = [];
  let startIndex = 0;
  let safetyPages = 0;
  const MAX_PAGES = 10; // 10 × 2000 = 20K CVEs cap

  while (safetyPages < MAX_PAGES) {
    const resp = await fetchNvdPage(pubStart, pubEnd, startIndex, apiKey);
    if (!resp || !resp.vulnerabilities || resp.vulnerabilities.length === 0) break;

    for (const v of resp.vulnerabilities) {
      const item = v.cve;
      if (!item || !item.id) continue;
      const cvss = pickCvss(item);
      const kevHit = kev.flags.get(item.id.toUpperCase());
      const passesCvss = typeof cvss.score === 'number' && cvss.score >= minCvss;
      if (!passesCvss && !kevHit) continue;

      const { vendors, products } = extractVendorsProducts(item);
      const cweIds = extractCwes(item);
      const description = extractDescription(item);

      out.push({
        cveId: item.id,
        source: 'NVD',
        publishedAt: item.published,
        lastModified: item.lastModified,
        cvssVersion: cvss.version,
        cvssScore: cvss.score,
        cvssSeverity: cvss.severity,
        cvssVector: cvss.vector,
        kevFlag: !!kevHit,
        kevAddedDate: kevHit?.addedDate || null,
        kevDueDate: kevHit?.dueDate || null,
        vendors,
        products,
        cweIds,
        description,
        referenceCount: Array.isArray(item.references) ? item.references.length : 0,
        // Truncate raw to keep DB row sane
        raw: {
          id: item.id,
          vulnStatus: item.vulnStatus,
          published: item.published,
          lastModified: item.lastModified,
        },
      });
    }

    const total = typeof resp.totalResults === 'number' ? resp.totalResults : 0;
    startIndex += PAGE_SIZE;
    safetyPages++;
    if (startIndex >= total) break;

    // Polite pause for anon rate limit
    if (!apiKey) await new Promise((r) => setTimeout(r, REQUEST_PAUSE_MS));
  }

  // 3. Add KEV-only entries that NVD did not surface in the window
  // (e.g. older CVEs newly added to KEV). For these we don't have NVD
  // detail; we still want them in the table so the dashboard can show
  // newly-actively-exploited vulnerabilities.
  const seenIds = new Set(out.map((r) => r.cveId.toUpperCase()));
  for (const [cveId, info] of kev.flags) {
    if (seenIds.has(cveId)) continue;
    out.push({
      cveId,
      source: 'NVD',
      publishedAt: info.addedDate ? `${info.addedDate}T00:00:00.000Z` : new Date().toISOString(),
      lastModified: info.addedDate ? `${info.addedDate}T00:00:00.000Z` : new Date().toISOString(),
      cvssVersion: null,
      cvssScore: null,
      cvssSeverity: null,
      cvssVector: null,
      kevFlag: true,
      kevAddedDate: info.addedDate,
      kevDueDate: info.dueDate,
      vendors: [],
      products: [],
      cweIds: [],
      description: null,
      referenceCount: 0,
      raw: { source: 'kev-only', kev: info },
    });
  }

  console.log(`[cyber-cves] Returning ${out.length} CVEs (NVD window=${window}d, minCvss=${minCvss}, kev=${kev.total})`);
  return out;
}
