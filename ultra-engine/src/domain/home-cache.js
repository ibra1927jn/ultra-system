// In-process cache para el agregador /api/home/overview.
// Fase 1.2: TTL=0 por defecto en todas las claves -> siempre recomputa.
// La estructura está lista para subir TTLs cuando midamos coste real.

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

module.exports = { getOrCompute, clear };
