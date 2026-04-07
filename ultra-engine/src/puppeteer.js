// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Puppeteer sidecar client (R5 P5/P6)      ║
// ║                                                            ║
// ║  Thin HTTP client al container ultra_puppeteer.            ║
// ║  Devuelve { ok, data, error } siempre — caller decide     ║
// ║  fallback. Si el sidecar no está running (profile gated)  ║
// ║  isAvailable() devuelve false sin lanzar.                 ║
// ╚══════════════════════════════════════════════════════════╝

const BASE = process.env.PUPPETEER_BASE_URL || 'http://puppeteer:3000';
const TIMEOUT = 90000; // scrapes pueden tardar 30-60s entre nav + waitFor

let _availableCache = null;
let _availableCacheTs = 0;

async function isAvailable() {
  // Cache la respuesta 60s para no hacer health checks en cada call
  if (_availableCache !== null && Date.now() - _availableCacheTs < 60000) {
    return _availableCache;
  }
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    _availableCache = r.ok;
  } catch {
    _availableCache = false;
  }
  _availableCacheTs = Date.now();
  return _availableCache;
}

/**
 * Scrape genérico via selector. Body shape:
 *   url:       string (https://...)
 *   waitFor:   string|number (selector CSS o ms a esperar)
 *   selectors: { name: cssSelector, ... }  → devuelve { name: [{text, href, html}, ...] }
 *   extract:   'html' | 'text' | 'links'  (alternativa cuando no usas selectors)
 *   evaluate:  string (JS expression a eval en page context)
 *   no_cache:  bool (default false; el sidecar cachea 15min)
 */
async function scrape(opts) {
  if (!opts?.url) return { ok: false, error: 'url required' };
  if (!(await isAvailable())) {
    return { ok: false, error: 'puppeteer sidecar not available — start with: docker compose --profile puppeteer up -d puppeteer' };
  }
  try {
    const r = await fetch(`${BASE}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, status: r.status, error: data?.error || 'sidecar HTTP error' };
    return data; // { ok, url, data, cached? }
  } catch (err) {
    // Si el sidecar acaba de morir, invalida la cache
    _availableCache = false;
    _availableCacheTs = Date.now();
    return { ok: false, error: err.message };
  }
}

module.exports = { isAvailable, scrape };
