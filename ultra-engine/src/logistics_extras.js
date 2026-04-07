// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Logistics extras (P6 Tier A)              ║
// ║                                                            ║
// ║  Fetchers extra para POIs y servicios de logística:        ║
// ║   • Park4Night via gtoselli/park4night-api unofficial      ║
// ║   • Freecycle (free items)                                 ║
// ║   • TransferCar / Imoova (relocation cars NZ/AU)           ║
// ║   • NZ vehicle compliance Self-Contained alerts            ║
// ║   • eSIMDB comparator                                      ║
// ║   • BlaBlaCar (stub keyed)                                 ║
// ║   • WiFi Map (stub keyed)                                  ║
// ║   • Open Charge Map (stub keyed)                           ║
// ║                                                            ║
// ║  Persisten a logistics_pois (UNIQUE source+external_id)    ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const cheerio = require('cheerio');

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; UltraSystem/1.0)' };
const TIMEOUT = 25000;

// ─── ensure POI table for non-camping logistics ─────────────
async function ensureLogisticsPois() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS logistics_pois (
       id SERIAL PRIMARY KEY,
       source TEXT NOT NULL,
       external_id TEXT,
       category TEXT NOT NULL,
       name TEXT,
       description TEXT,
       latitude DOUBLE PRECISION,
       longitude DOUBLE PRECISION,
       country TEXT,
       region TEXT,
       url TEXT,
       payload JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE(source, external_id)
     )`
  );
}

async function insertPoi(row) {
  await ensureLogisticsPois();
  const r = await db.queryOne(
    `INSERT INTO logistics_pois
       (source, external_id, category, name, description, latitude, longitude, country, region, url, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
    [row.source, row.external_id, row.category, row.name || null, row.description || null,
     row.latitude || null, row.longitude || null, row.country || null, row.region || null,
     row.url || null, row.payload ? JSON.stringify(row.payload) : null]
  );
  return !!r;
}

// Skipped 2026-04-07: park4night.com cerró su API (HTTP 400 en /api/places/around).
// Cobertura camping NZ ya tenemos vía Overpass (1902 POIs en log_pois).
async function fetchPark4Night() {
  return { source: 'park4night', skipped: 'api_closed_2024', fetched: 0, inserted: 0 };
}

// Skipped 2026-04-07: groups.freecycle.org devuelve 422 sobre /posts/rss (datacenter
// rate-limit / IP block). Sin alternativa pública.
async function fetchFreecycle() {
  return { source: 'freecycle', skipped: 'datacenter_blocked_422', inserted: 0 };
}

// ════════════════════════════════════════════════════════════
//  TransferCar — $1/day NZ relocation cars
//  Fix 2026-04-07: /Car-Relocations/All ahora 404. Las relocaciones
//  se listan directamente en la homepage en formato:
//    "https://www.transfercar.co.nz/relocation/{From}/{To}/{ID}.html"
//  Las parseamos vía regex sobre el HTML servido.
// ════════════════════════════════════════════════════════════
async function fetchTransferCar() {
  try {
    const r = await fetch('https://www.transfercar.co.nz/', {
      headers: UA, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const re = /"https:\/\/www\.transfercar\.co\.nz\/relocation\/([^/]+)\/([^/]+)\/(\d+)\.html"/g;
    const seen = new Set();
    let inserted = 0;
    let m;
    while ((m = re.exec(html)) !== null) {
      const [, fromRaw, toRaw, id] = m;
      if (seen.has(id)) continue;
      seen.add(id);
      const from = fromRaw.replace(/_/g, ' ');
      const to = toRaw.replace(/_/g, ' ');
      const url = `https://www.transfercar.co.nz/relocation/${fromRaw}/${toRaw}/${id}.html`;
      const ok = await insertPoi({
        source: 'transfercar',
        external_id: id,
        category: 'relocation',
        name: `${from} → ${to}`,
        description: `Car relocation deal $1/day. ${from} → ${to}`,
        country: 'NZ',
        url,
        payload: { from, to },
      });
      if (ok) inserted++;
    }
    return { source: 'transfercar', fetched: seen.size, inserted };
  } catch (err) {
    return { source: 'transfercar', error: err.message };
  }
}

// Skipped 2026-04-07: imoova.com migró a Next.js SPA, contenido cargado vía JS.
// HTML server-side sólo tiene marketing pages, los listados reales necesitan
// Puppeteer (deferido). Endpoints /relocations.json y /api/v1/* devuelven
// "Only HTML requests are supported here". TransferCar cubre NZ; para AU/EU
// reactivar cuando sidecar Puppeteer esté disponible.
async function fetchImoova() {
  return { source: 'imoova', skipped: 'spa_needs_puppeteer', inserted: 0 };
}

// Skipped 2026-04-07: nzta.govt.nz/feed/news/ devuelve Incapsula challenge
// (anti-bot CDN) desde IP datacenter Hetzner — no parsea como RSS.
// Sin proxy residencial no hay fix para NZTA news. Las reglas SCV cambian
// raramente y ya están documentadas en la app principal.
async function fetchNZVehicleCompliance() {
  return { source: 'nzta_news', skipped: 'incapsula_block_datacenter', inserted: 0 };
}

// Skipped 2026-04-07: esimdb.com es Vue SPA (path correcto es /new-zealand,
// no /nz, pero el contenido se renderiza vía JS). Sin endpoint público.
// Para reactivar usar Puppeteer sidecar.
async function fetchESIMDB() {
  return { source: 'esimdb', skipped: 'spa_needs_puppeteer', inserted: 0 };
}

// ════════════════════════════════════════════════════════════
//  STUBS — keyed (BlaBlaCar / WiFi Map / Open Charge Map)
// ════════════════════════════════════════════════════════════
async function fetchBlaBlaCar({ from = 'Madrid', to = 'Barcelona' } = {}) {
  const key = process.env.BLABLACAR_API_KEY;
  if (!key) return { source: 'blablacar', skipped: 'BLABLACAR_API_KEY no configurada' };
  try {
    const url = `https://public-api.blablacar.com/api/v3/trips?from_coordinate=40.4168,-3.7038&to_coordinate=41.3851,2.1734&locale=en_GB&currency=EUR`;
    const r = await fetch(url, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const trips = data.trips || [];
    let inserted = 0;
    for (const t of trips.slice(0, 30)) {
      const ok = await insertPoi({
        source: 'blablacar',
        external_id: t.link || t.id,
        category: 'rideshare',
        name: `${t.waypoints?.[0]?.place?.city || from} → ${t.waypoints?.slice(-1)[0]?.place?.city || to}`,
        description: `${t.price?.amount} ${t.price?.currency} · ${t.duration}`,
        url: t.link,
        payload: t,
      });
      if (ok) inserted++;
    }
    return { source: 'blablacar', fetched: trips.length, inserted };
  } catch (err) {
    return { source: 'blablacar', error: err.message };
  }
}

async function fetchWifiMap({ lat = -36.85, lon = 174.76 } = {}) {
  const key = process.env.WIFIMAP_API_KEY;
  if (!key) return { source: 'wifimap', skipped: 'WIFIMAP_API_KEY no configurada' };
  try {
    const url = `https://api.wifimap.io/v1/wifis?lat=${lat}&lon=${lon}&radius=5000`;
    const r = await fetch(url, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const points = data.wifis || data || [];
    let inserted = 0;
    for (const p of points.slice(0, 200)) {
      const ok = await insertPoi({
        source: 'wifimap',
        external_id: String(p.id || `${p.lat}:${p.lon}`),
        category: 'wifi',
        name: p.ssid || 'WiFi',
        description: p.password ? `Password: ${p.password}` : 'No password',
        latitude: p.lat, longitude: p.lon,
        payload: p,
      });
      if (ok) inserted++;
    }
    return { source: 'wifimap', fetched: points.length, inserted };
  } catch (err) {
    return { source: 'wifimap', error: err.message };
  }
}

async function fetchOpenChargeMap({ country = 'NZ', maxresults = 200 } = {}) {
  const key = process.env.OCM_API_KEY;
  if (!key) return { source: 'open_charge_map', skipped: 'OCM_API_KEY no configurada' };
  try {
    const url = `https://api.openchargemap.io/v3/poi?countrycode=${country}&maxresults=${maxresults}&compact=true&verbose=false&key=${key}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    let inserted = 0;
    for (const p of (data || []).slice(0, maxresults)) {
      const addr = p.AddressInfo || {};
      const ok = await insertPoi({
        source: 'open_charge_map',
        external_id: String(p.ID),
        category: 'ev_charger',
        name: addr.Title,
        description: addr.AddressLine1,
        latitude: addr.Latitude, longitude: addr.Longitude,
        country: addr.Country?.ISOCode,
        url: addr.RelatedURL,
        payload: { connections: p.Connections },
      });
      if (ok) inserted++;
    }
    return { source: 'open_charge_map', fetched: data.length, inserted };
  } catch (err) {
    return { source: 'open_charge_map', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  R4 P6 Tier A — Overpass essentials (van-life critical POIs)
//  Fuel stations, drinking water, public showers, public toilets,
//  laundromats, picnic sites. Free OSM data, sin keys, sin auth.
//  Persiste a log_pois (tabla principal de POIs, no logistics_pois)
//  para que aparezcan en /api/logistics/pois junto a campings.
// ════════════════════════════════════════════════════════════
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OVERPASS_ESSENTIALS_KINDS = [
  { kind: 'fuel',           tag: '"amenity"="fuel"',           limit: 2000 },
  { kind: 'drinking_water', tag: '"amenity"="drinking_water"', limit: 2000 },
  { kind: 'shower',         tag: '"amenity"="shower"',         limit: 1000 },
  { kind: 'toilets',        tag: '"amenity"="toilets"',        limit: 3000 },
  { kind: 'laundry',        tag: '"shop"="laundry"',           limit: 1000 },
  { kind: 'picnic_site',    tag: '"tourism"="picnic_site"',    limit: 2000 },
];

async function fetchOverpassEssentials({ country = 'NZ' } = {}) {
  // log_pois ya existe (creada por el seed Tier S iOverlander pivot, 22K campings).
  // Schema usa poi_type + source_id + UNIQUE(source, source_id).
  const results = [];
  for (const k of OVERPASS_ESSENTIALS_KINDS) {
    try {
      const query = `[out:json][timeout:60];area["ISO3166-1"="${country}"];node[${k.tag}](area);out body ${k.limit};`;
      const r = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...UA },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(120000),
      });
      if (!r.ok) { results.push({ kind: k.kind, error: `HTTP ${r.status}` }); continue; }
      const data = await r.json();
      const elements = data.elements || [];
      let inserted = 0;
      for (const e of elements) {
        if (!e.lat || !e.lon) continue;
        const name = (e.tags?.name || e.tags?.brand || k.kind).slice(0, 500);
        const ok = await db.queryOne(
          `INSERT INTO log_pois (source, source_id, poi_type, name, latitude, longitude, country, tags)
           VALUES ('overpass_essentials', $1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (source, source_id) DO NOTHING RETURNING id`,
          [`osm:node:${e.id}`, k.kind, name, e.lat, e.lon, country,
           e.tags ? JSON.stringify(e.tags) : null]
        );
        if (ok) inserted++;
      }
      results.push({ kind: k.kind, fetched: elements.length, inserted });
      // Throttle: Overpass público recomienda max ~10 req/min — 7s entre queries
      await new Promise(r => setTimeout(r, 7000));
    } catch (err) {
      results.push({ kind: k.kind, error: err.message });
    }
  }
  const totalInserted = results.reduce((a, x) => a + (x.inserted || 0), 0);
  const totalFetched = results.reduce((a, x) => a + (x.fetched || 0), 0);
  return { source: 'overpass_essentials', country, fetched: totalFetched, inserted: totalInserted, breakdown: results };
}

async function fetchAll() {
  const results = [];
  for (const fn of [fetchPark4Night, fetchFreecycle, fetchTransferCar, fetchImoova,
                    fetchNZVehicleCompliance, fetchESIMDB, fetchBlaBlaCar, fetchWifiMap, fetchOpenChargeMap]) {
    try { results.push(await fn()); } catch (e) { results.push({ source: fn.name, error: e.message }); }
  }
  return results;
}

module.exports = {
  fetchPark4Night,
  fetchFreecycle,
  fetchTransferCar,
  fetchImoova,
  fetchNZVehicleCompliance,
  fetchESIMDB,
  fetchBlaBlaCar,
  fetchWifiMap,
  fetchOpenChargeMap,
  fetchOverpassEssentials,
  fetchAll,
  ensureLogisticsPois,
};
