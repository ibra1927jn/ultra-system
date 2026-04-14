// ╔══════════════════════════════════════════════════════════╗
// ║  Per-user rate limiting                                  ║
// ║                                                          ║
// ║  In-memory token bucket keyed by userId (from JWT).      ║
// ║  Cheaper than Redis for single-instance deploy; if we    ║
// ║  scale to multi-instance, swap for Redis INCR+EXPIRE.    ║
// ║                                                          ║
// ║  Separate buckets per "class" of endpoint:               ║
// ║   - scrape (fulltext, translate): expensive, tight limit ║
// ║   - search: medium cost, moderate limit                  ║
// ║   - default: light, generous limit                       ║
// ╚══════════════════════════════════════════════════════════╝

const buckets = new Map();  // key: "userId:class" → { tokens, lastRefill }

function makeLimiter({ cls, capacity, refillPerSec }) {
  return (req, res, next) => {
    const userId = req.userId || req.ip || 'anonymous';
    const key = `${userId}:${cls}`;
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) {
      b = { tokens: capacity, lastRefill: now };
      buckets.set(key, b);
    }
    // Refill based on elapsed time
    const elapsed = (now - b.lastRefill) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
    b.lastRefill = now;
    if (b.tokens < 1) {
      const retryAfter = Math.ceil((1 - b.tokens) / refillPerSec);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        ok: false,
        error: `rate limit exceeded for ${cls}`,
        retry_after_sec: retryAfter,
      });
    }
    b.tokens -= 1;
    next();
  };
}

// Pre-configured limiters
const scrapeLimiter = makeLimiter({ cls: 'scrape', capacity: 10, refillPerSec: 10 / 60 });  // 10 per minute burst, sustained 10/min
const searchLimiter = makeLimiter({ cls: 'search', capacity: 30, refillPerSec: 30 / 60 });  // 30/min
const defaultLimiter = makeLimiter({ cls: 'default', capacity: 120, refillPerSec: 120 / 60 });  // 120/min (2/sec sustained)

// Cleanup stale buckets every 10min so memory doesn't grow unbounded
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [k, b] of buckets) if (b.lastRefill < cutoff) buckets.delete(k);
}, 10 * 60 * 1000).unref();

module.exports = { makeLimiter, scrapeLimiter, searchLimiter, defaultLimiter };
