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

// ════════════════════════════════════════════════════════════
//  Park4Night — van-life camping POIs (R5 step 5)
// ════════════════════════════════════════════════════════════
// Reactivation strategy (2026-04-08):
//  1. /api/places/around sigue 400. Frontend usa SPA con CF challenge.
//  2. DESCUBIERTO: cada detail page /en/place/{id} tiene una static-map
//     image de shape:
//       https://cdn3.park4night.com/img_cache/streets-v2/{zoom}/{lat}/{lon}/{color}/{WxH}.jpg
//     Lat/lon baked en el URL. No necesitamos JS runtime, sólo HTML.
//  3. IDs los sacamos de sitemap-index.xml (91 sitemap files, ~350K places total).
//  4. Páginas crudas están protegidas por CF challenge intermitente → usamos
//     Puppeteer sidecar que pasa el challenge. Coste ~3-5s/página.
//  5. Batched: BATCH_SIZE places per run (default 50). Cron-friendly. Acumula
//     cobertura en el tiempo sin bloquear nada. State en tabla p4n_crawl_state.
//
// Resultado: {source, scanned, inserted, skipped_no_coord, total_known, batch_range}
async function fetchPark4Night({ batchSize = 50 } = {}) {
  const pup = require('./puppeteer');
  if (!(await pup.isAvailable())) {
    return { source: 'park4night', skipped: 'puppeteer_sidecar_offline', fetched: 0, inserted: 0 };
  }

  // ─── Ensure crawl state table (tracks progress across runs) ─────
  await db.query(
    `CREATE TABLE IF NOT EXISTS p4n_crawl_state (
       id INT PRIMARY KEY DEFAULT 1,
       last_sitemap_idx INT NOT NULL DEFAULT 1,
       last_place_idx INT NOT NULL DEFAULT 0,
       place_ids JSONB,
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  let state = await db.queryOne('SELECT * FROM p4n_crawl_state WHERE id = 1');
  if (!state) {
    await db.query('INSERT INTO p4n_crawl_state (id, last_sitemap_idx, last_place_idx, place_ids) VALUES (1, 1, 0, NULL)');
    state = { last_sitemap_idx: 1, last_place_idx: 0, place_ids: null };
  }

  // ─── If place_ids cache empty, fetch sitemap-{idx} and extract ──
  let placeIds = state.place_ids || [];
  if (!placeIds.length || state.last_place_idx >= placeIds.length) {
    try {
      const sitemapUrl = `https://park4night.com/sitemap/sitemap-${state.last_sitemap_idx}.xml`;
      const r = await fetch(sitemapUrl, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`sitemap HTTP ${r.status}`);
      const xml = await r.text();
      const matches = xml.match(/\/en\/place\/\d+/g) || [];
      placeIds = [...new Set(matches.map(m => parseInt(m.split('/').pop())))].sort((a, b) => a - b);
      state.last_place_idx = 0;
      state.last_sitemap_idx = state.last_sitemap_idx + (placeIds.length ? 0 : 1); // advance if empty
      await db.query(
        'UPDATE p4n_crawl_state SET place_ids = $1, last_place_idx = $2, last_sitemap_idx = $3, updated_at = NOW() WHERE id = 1',
        [JSON.stringify(placeIds), state.last_place_idx, state.last_sitemap_idx]
      );
    } catch (err) {
      return { source: 'park4night', error: `sitemap fetch: ${err.message}`, inserted: 0 };
    }
  }

  // ─── Process batch ──────────────────────────────────────────────
  const start = state.last_place_idx || 0;
  const end = Math.min(start + batchSize, placeIds.length);
  const batch = placeIds.slice(start, end);

  let inserted = 0, skippedNoCoord = 0, errors = 0;
  for (const id of batch) {
    try {
      const r = await pup.scrape({
        url: `https://park4night.com/en/place/${id}`,
        waitFor: 3000,
        evaluate: '({' +
          'title: document.querySelector("h1.place-header-name")?.innerText?.trim(),' +
          'coord: Array.from(document.querySelectorAll("img")).map(i=>i.src).find(s=>s?.includes("img_cache/streets-v2/")),' +
          'desc: document.querySelector(".place-description, .description-content, [itemprop=description]")?.innerText?.slice(0,500)' +
        '})',
      });
      if (!r.ok || !r.data?.coord) { skippedNoCoord++; continue; }
      const coordMatch = r.data.coord.match(/img_cache\/streets-v2\/\d+\/(-?\d+\.\d+)\/(-?\d+\.\d+)/);
      if (!coordMatch) { skippedNoCoord++; continue; }
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      const name = r.data.title || `park4night #${id}`;
      const ok = await insertPoi({
        source: 'park4night',
        external_id: `p4n:${id}`,
        category: 'camping_van',
        name: name.slice(0, 200),
        description: (r.data.desc || '').slice(0, 1000),
        latitude: lat,
        longitude: lon,
        url: `https://park4night.com/en/place/${id}`,
        payload: { source_id: id, coord_source: 'sitemap_streets_v2' },
      });
      if (ok) inserted++;
    } catch (err) {
      errors++;
      if (errors > 10) break; // abort batch if too many errors in a row
    }
  }

  // ─── Advance cursor ─────────────────────────────────────────────
  let newIdx = end;
  let newSitemapIdx = state.last_sitemap_idx;
  let newPlaceIds = placeIds;
  if (newIdx >= placeIds.length) {
    newSitemapIdx = state.last_sitemap_idx + 1;
    newIdx = 0;
    newPlaceIds = null; // trigger re-fetch next run
  }
  await db.query(
    'UPDATE p4n_crawl_state SET last_sitemap_idx = $1, last_place_idx = $2, place_ids = $3, updated_at = NOW() WHERE id = 1',
    [newSitemapIdx, newIdx, newPlaceIds ? JSON.stringify(newPlaceIds) : null]
  );

  return {
    source: 'park4night',
    scanned: batch.length,
    inserted,
    skipped_no_coord: skippedNoCoord,
    errors,
    total_known: placeIds.length,
    batch_range: [start, end],
    sitemap: state.last_sitemap_idx,
    via: 'puppeteer+sitemap',
  };
}

// Skipped 2026-04-07: groups.freecycle.org devuelve 422 sobre /posts/rss.
// Verified 2026-04-08 (R6): intentado con Puppeteer contra /posts main page,
// devuelve "404 Error" page — la URL /posts ya no existe. Freecycle rehizo
// su site y el único listado público ahora requiere login. Dead end.
async function fetchFreecycle() {
  return { source: 'freecycle', skipped: 'posts_page_404_and_login_required', inserted: 0 };
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

// R5 2026-04-08: Imoova reactivado vía Puppeteer. /en/relocations devuelve
// 50+ anchors `a[href*="/en/relocations/deal/"]` con shape
// `{from}-to-{to}-RLC{id}`. Text: "From → To, Available MMM-MMM, N days".
async function fetchImoova() {
  const pup = require('./puppeteer');
  if (!(await pup.isAvailable())) {
    return { source: 'imoova', skipped: 'puppeteer_sidecar_offline', inserted: 0 };
  }
  try {
    const r = await pup.scrape({
      url: 'https://www.imoova.com/en/relocations',
      waitFor: 6000,
      selectors: { deals: 'a[href*="/en/relocations/deal/"]' },
    });
    if (!r.ok) return { source: 'imoova', error: r.error, inserted: 0 };

    const items = r.data?.deals || [];
    const seen = new Set();
    let inserted = 0;
    for (const it of items) {
      const href = (it.href || '').replace(/\/$/, '');
      if (!href || seen.has(href)) continue;
      seen.add(href);
      // Extract RLC code as external_id
      const match = href.match(/\/deal\/([^/?#]+)/);
      if (!match) continue;
      const slug = match[1];
      const rlcMatch = slug.match(/RLC\d+/);
      const extId = rlcMatch ? rlcMatch[0] : slug;

      const rawText = (it.text || '').replace(/\s+/g, ' ').trim();
      if (!rawText) continue;
      // Parse "From → To" from text (first " → " before "Available" or newline)
      const routeMatch = rawText.match(/^(.+?\s*→\s*[^,]+?)(?:\s+Available|,|$)/);
      const name = routeMatch ? routeMatch[1].trim() : rawText.slice(0, 80);

      const ok = await insertPoi({
        source: 'imoova',
        external_id: extId,
        category: 'vehicle_relocation',
        name,
        description: rawText.slice(0, 500),
        country: null,
        region: null,
        url: href,
        payload: { raw_text: rawText.slice(0, 1000) },
      });
      if (ok) inserted++;
    }
    return { source: 'imoova', total: seen.size, inserted, via: 'puppeteer' };
  } catch (err) {
    return { source: 'imoova', error: err.message, inserted: 0 };
  }
}

// Skipped 2026-04-07: nzta.govt.nz/feed/news/ devuelve Incapsula challenge
// (anti-bot CDN) desde IP datacenter Hetzner — no parsea como RSS.
// Sin proxy residencial no hay fix para NZTA news. Las reglas SCV cambian
// raramente y ya están documentadas en la app principal.
async function fetchNZVehicleCompliance() {
  return { source: 'nzta_news', skipped: 'incapsula_block_datacenter', inserted: 0 };
}

// R5 2026-04-08: intentado con Puppeteer sidecar. La página /new-zealand
// carga pero el DOM está ruidoso: 1888 matches con [class*=price], 2587 con
// [class*=provider], 0 anchors estables a detail pages. Los planes se
// renderizan en componentes Vue anidados sin data-attributes claros.
// Necesita: (a) selector estable post-inspección manual, o (b) interceptar
// la API GraphQL interna que probablemente alimenta la tabla.
// Deferido. Ver BACKLOG Priority pending.
async function fetchESIMDB() {
  return { source: 'esimdb', skipped: 'dom_too_noisy_needs_manual_inspection', inserted: 0 };
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

// ════════════════════════════════════════════════════════════
//  iOverlander — bulk CSV importer (Tier S #2 partial)
// ════════════════════════════════════════════════════════════
// Background: iOverlander tiene un endpoint oficial de export por país en
//   /export/places?countries[]=N&xformat=csv|gpx|json|kml
// pero requiere subscripción Unlimited (paywall). El parser que sigue es
// agnóstico al origen del CSV: acepta cualquier export con el header oficial
// de 37 columnas (Id, Location, Name, Category, Description, Latitude,
// Longitude, Altitude, Date verified, Open, Electricity, Wifi, Kitchen,
// Parking, Restaurant, Showers, Water, Toilets, Big rig friendly, Tent
// friendly, Pet friendly, Sanitation dump station, Outdoor gear, Groceries,
// Artisan goods, Bakery, Rarity in this area, Repairs vehicles, Repairs
// motorcycles, Repairs bicycles, Sells parts, Recycles batteries, Recycles
// oil, Bio fuel, Electric vehicle charging, Composting sawdust, Recycling
// center).
//
// Hoy lo usa el seed script `seed_iov_canada.js` que descarga el dump
// publicado por cug/wp_converter (MIT) en GitHub. El mismo importer servirá
// para los downloads oficiales por país cuando el usuario active Unlimited.
//
// Persiste a `log_pois` (la tabla rica con amenity flags), source='ioverlander'.
async function importIOverlanderCSV(csvBuffer, { country = null, defaultPoiType = 'campsite' } = {}) {
  const { parse } = require('csv-parse/sync');
  const records = parse(csvBuffer, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  });

  // Map iOverlander Category → log_pois.poi_type. Lo que no encaja se
  // normaliza (lowercased + non-alnum→_) y se guarda tal cual. Mantenemos
  // los nombres comunes alineados con los que usa Overpass para que el
  // comando /poi siga funcionando con el filtro `tipo`.
  const CATEGORY_MAP = {
    'wild camping': 'wild_camp',
    'free wild camping': 'wild_camp',
    'informal campsite': 'informal_camp',
    'established campground': 'campsite',
    'paid campground': 'campsite',
    'water': 'water',
    'showers': 'shower',
    'sanitation dump station': 'dump_station',
    'toilets': 'toilets',
    'fuel station': 'fuel',
    'propane': 'propane',
    'mechanic and parts': 'mechanic',
    'mechanic': 'mechanic',
    'laundromat': 'laundromat',
    'shopping': 'shopping',
    'restaurant': 'food',
    'cafe': 'food',
    'hotel': 'lodging',
    'hostel': 'lodging',
    'guest house': 'lodging',
    'wifi': 'wifi',
    'electric vehicle charging': 'ev_charging',
    'border crossing': 'border',
    'medical': 'medical',
    'veterinarian': 'vet',
  };
  const normalizePoi = (cat) => {
    if (!cat) return defaultPoiType;
    const key = cat.toLowerCase().trim();
    if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];
    return key.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || defaultPoiType;
  };

  // Helper: iOverlander amenity columns son strings ("Yes", "No",
  // "Yes - At Sites", "Pit Toilets", "Natural Source", "Unknown", ""...).
  // Convertimos a tri-state: true (positivo), false (negativo), null (unknown/blank).
  const yn = (v) => {
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (s === '' || s === 'unknown') return null;
    if (s.startsWith('no')) return false;
    if (s.startsWith('yes')) return true;
    // Cualquier descriptor no vacío y no "no" cuenta como positivo
    // ("Pit Toilets", "Natural Source", "Composting", etc.)
    return true;
  };

  let inserted = 0, updated = 0, skipped = 0, errors = 0;
  const t0 = Date.now();

  for (const r of records) {
    try {
      const id = String(r.Id || '').trim();
      const lat = parseFloat(r.Latitude);
      const lon = parseFloat(r.Longitude);
      if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) {
        skipped++; continue;
      }
      const name = (r.Name || r.Category || 'Unnamed').slice(0, 500);
      const poiType = normalizePoi(r.Category);

      // Tags JSONB con todo lo no canonizado, útil para querys avanzadas
      const tags = {
        category: r.Category || null,
        location_address: r.Location || null,
        date_verified: r['Date verified'] || null,
        open: r.Open || null,
        big_rig_friendly: yn(r['Big rig friendly']),
        tent_friendly: yn(r['Tent friendly']),
        pet_friendly: yn(r['Pet friendly']),
        kitchen: yn(r.Kitchen),
        parking: yn(r.Parking),
        restaurant: yn(r.Restaurant),
        toilets: r.Toilets || null,
        groceries: yn(r.Groceries),
        bakery: yn(r.Bakery),
        outdoor_gear: yn(r['Outdoor gear']),
        artisan_goods: yn(r['Artisan goods']),
        rarity: r['Rarity in this area'] || null,
        repairs_vehicles: yn(r['Repairs vehicles']),
        repairs_motorcycles: yn(r['Repairs motorcycles']),
        repairs_bicycles: yn(r['Repairs bicycles']),
        sells_parts: yn(r['Sells parts']),
        recycles_batteries: yn(r['Recycles batteries']),
        recycles_oil: yn(r['Recycles oil']),
        bio_fuel: yn(r['Bio fuel']),
        ev_charging: yn(r['Electric vehicle charging']),
        composting_sawdust: yn(r['Composting sawdust']),
        recycling_center: yn(r['Recycling center']),
      };
      // Limpia null fields para no inflar el JSON
      Object.keys(tags).forEach(k => { if (tags[k] == null) delete tags[k]; });

      const result = await db.queryOne(
        `INSERT INTO log_pois
           (name, latitude, longitude, poi_type, country, source, source_id,
            has_water, has_dump, has_shower, has_wifi, has_power,
            tags, notes, fetched_at)
         VALUES ($1, $2, $3, $4, $5, 'ioverlander', $6,
                 $7, $8, $9, $10, $11,
                 $12, $13, NOW())
         ON CONFLICT (source, source_id) DO UPDATE SET
           name = EXCLUDED.name,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           poi_type = EXCLUDED.poi_type,
           tags = EXCLUDED.tags,
           notes = EXCLUDED.notes,
           fetched_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          name, lat, lon, poiType, country, `iov:${id}`,
          yn(r.Water),
          yn(r['Sanitation dump station']),
          yn(r.Showers),
          yn(r.Wifi),
          yn(r.Electricity),
          JSON.stringify(tags),
          (r.Description || '').slice(0, 4000),
        ]
      );
      if (result?.inserted) inserted++; else updated++;
    } catch (e) {
      errors++;
      if (errors <= 3) console.warn('iov import row error:', e.message);
    }
  }

  return {
    source: 'ioverlander',
    rows: records.length,
    inserted, updated, skipped, errors,
    elapsed_ms: Date.now() - t0,
  };
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
  importIOverlanderCSV,
};
