// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA SYSTEM — Service Worker (P6 Fase 2 offline-first) ║
// ║                                                            ║
// ║  Cache strategy:                                           ║
// ║  - Static assets (HTML/CSS/JS): cache-first                ║
// ║  - API responses (/api/*): network-first con fallback     ║
// ║    a cache (último OK guardado)                            ║
// ║  - Maps (PMTiles): cache-first persistente                 ║
// ║                                                            ║
// ║  Habilita van-life offline: el dashboard sigue mostrando  ║
// ║  el último snapshot conocido cuando no hay conectividad.   ║
// ╚══════════════════════════════════════════════════════════╝

const CACHE_VERSION = 'ultra-v2-2026-04-07';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const MAPS_CACHE = `${CACHE_VERSION}-maps`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Maps: cache-first, persistente
  if (url.pathname.startsWith('/maps/')) {
    event.respondWith(
      caches.open(MAPS_CACHE).then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached;
          return fetch(event.request).then(resp => {
            if (resp.ok) cache.put(event.request, resp.clone());
            return resp;
          });
        })
      )
    );
    return;
  }

  // API: network-first con fallback a cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).then(resp => {
        if (resp.ok && event.request.method === 'GET') {
          const respClone = resp.clone();
          caches.open(API_CACHE).then(cache => cache.put(event.request, respClone));
        }
        return resp;
      }).catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response(JSON.stringify({ ok: false, offline: true }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        )
      )
    );
    return;
  }

  // Static: cache-first
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(resp => {
        if (resp.ok && event.request.method === 'GET') {
          const respClone = resp.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(event.request, respClone));
        }
        return resp;
      })
    )
  );
});
