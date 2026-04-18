// In-process cache para el agregador /api/home/overview.
// TTL por clave, TTL=0 deshabilita cache (siempre recomputa).

const store = new Map();

async function getOrCompute(key, ttlMs, fn) {
  if (ttlMs > 0) {
    const entry = store.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value;
  }
  const value = await fn();
  if (ttlMs > 0) store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

function clear() { store.clear(); }

// Invalidación selectiva por prefix match. Usada desde endpoints de
// escritura (POST /api/bio/mood, /api/finances, /api/logistics) para
// que el home aggregator refleje cambios inmediatos en lugar de
// esperar al TTL (30-60s).
function invalidate(prefix) {
  if (!prefix) return 0;
  let count = 0;
  for (const key of store.keys()) {
    if (key.startsWith(prefix) || key === prefix) {
      store.delete(key);
      count++;
    }
  }
  return count;
}

module.exports = { getOrCompute, clear, invalidate };
