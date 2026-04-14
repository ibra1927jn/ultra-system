// ╔══════════════════════════════════════════════════════════╗
// ║  In-process LRU query cache                              ║
// ║                                                          ║
// ║  Wraps expensive DB-heavy endpoints (search, news/       ║
// ║  filtered, intelligence-brief) so repeat queries within  ║
// ║  TTL skip the DB entirely.                               ║
// ║                                                          ║
// ║  Design:                                                 ║
// ║   - Per-namespace Map (preserves insertion order for LRU)║
// ║   - Each entry: { value, expiresAt }                    ║
// ║   - On get: check expiry, move to end for LRU            ║
// ║   - On set: evict oldest if over capacity                ║
// ╚══════════════════════════════════════════════════════════╝

function createCache({ capacity = 500, ttlMs = 60 * 1000 } = {}) {
  const store = new Map();
  let hits = 0, misses = 0;

  function get(key) {
    const entry = store.get(key);
    if (!entry) { misses++; return null; }
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      misses++;
      return null;
    }
    // Move to end (LRU refresh)
    store.delete(key);
    store.set(key, entry);
    hits++;
    return entry.value;
  }

  function set(key, value, customTtl) {
    if (store.size >= capacity) {
      // Evict oldest entry (first inserted)
      const firstKey = store.keys().next().value;
      store.delete(firstKey);
    }
    store.set(key, {
      value,
      expiresAt: Date.now() + (customTtl || ttlMs),
    });
  }

  function clear() { store.clear(); hits = 0; misses = 0; }

  function stats() {
    const total = hits + misses;
    return {
      size: store.size,
      capacity,
      hits,
      misses,
      hit_rate: total > 0 ? (hits / total) : 0,
    };
  }

  return { get, set, clear, stats };
}

// Named caches for different endpoint classes, each with own TTL
const searchCache = createCache({ capacity: 300, ttlMs: 60 * 1000 });          // 1min — searches re-run often
const filteredCache = createCache({ capacity: 500, ttlMs: 90 * 1000 });        // 1.5min — news query
const briefCache = createCache({ capacity: 10, ttlMs: 2 * 60 * 1000 });        // 2min — intelligence brief
const snapshotCache = createCache({ capacity: 5, ttlMs: 90 * 1000 });          // 1.5min — markets snapshot
const suggestCache = createCache({ capacity: 200, ttlMs: 5 * 60 * 1000 });     // 5min — autocomplete

/**
 * Express middleware factory that caches GET responses.
 * Key is the full request URL (query params included).
 * Only caches status 200 with JSON bodies.
 */
function cacheMiddleware(cache) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();
    const key = req.originalUrl || req.url;
    const cached = cache.get(key);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      res.setHeader('X-Cache-Hit-Rate', (cache.stats().hit_rate * 100).toFixed(1) + '%');
      return res.json(cached);
    }
    res.setHeader('X-Cache', 'MISS');
    // Wrap res.json to capture + cache the body
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200 && body) cache.set(key, body);
      return originalJson(body);
    };
    next();
  };
}

module.exports = {
  createCache,
  cacheMiddleware,
  searchCache,
  filteredCache,
  briefCache,
  snapshotCache,
  suggestCache,
};
