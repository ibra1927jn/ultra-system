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
//  Park4Night unofficial — gtoselli/park4night-api
//  Returns campsites within bbox
// ════════════════════════════════════════════════════════════
async function fetchPark4Night({ bbox = '-47.3,166.0,-34.0,178.6' /* NZ */, country = 'NZ' } = {}) {
  try {
    // Endpoint reverse-engineered: https://www.park4night.com/api/places/around
    const [s, w, n, e] = bbox.split(',').map(parseFloat);
    const url = `https://www.park4night.com/api/places/around?lat_min=${s}&lng_min=${w}&lat_max=${n}&lng_max=${e}&category=&user_id=0&filter=`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(TIMEOUT) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const places = data.places || data || [];
    let inserted = 0;
    for (const p of places.slice(0, 500)) {
      const ok = await insertPoi({
        source: 'park4night',
        external_id: String(p.id),
        category: 'camping',
        name: p.name || p.title,
        description: (p.description || '').slice(0, 1000),
        latitude: parseFloat(p.lat),
        longitude: parseFloat(p.lng),
        country,
        url: `https://www.park4night.com/lieu/${p.id}`,
        payload: { rating: p.note, category_id: p.categorie_id },
      });
      if (ok) inserted++;
    }
    return { source: 'park4night', country, fetched: places.length, inserted };
  } catch (err) {
    return { source: 'park4night', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Freecycle — free items by group
//  RSS feed per group: https://groups.freecycle.org/group/{group}/rss
// ════════════════════════════════════════════════════════════
async function fetchFreecycle({ groups = ['Auckland'] } = {}) {
  try {
    const Parser = require('rss-parser');
    const p = new Parser({ timeout: TIMEOUT, headers: UA });
    let inserted = 0;
    for (const g of groups) {
      const url = `https://groups.freecycle.org/group/${encodeURIComponent(g)}/posts/rss`;
      try {
        const feed = await p.parseURL(url);
        for (const it of (feed.items || []).slice(0, 30)) {
          const ok = await insertPoi({
            source: 'freecycle',
            external_id: it.guid || it.link,
            category: 'free_item',
            name: it.title,
            description: (it.contentSnippet || '').slice(0, 1000),
            url: it.link,
            payload: { group: g, posted: it.isoDate },
          });
          if (ok) inserted++;
        }
      } catch (e) { /* skip group */ }
    }
    return { source: 'freecycle', groups, inserted };
  } catch (err) {
    return { source: 'freecycle', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  TransferCar — $1/day NZ/AU relocation cars
//  Sin API oficial → scrape HTML listing
// ════════════════════════════════════════════════════════════
async function fetchTransferCar() {
  try {
    const r = await fetch('https://www.transfercar.co.nz/Car-Relocations/All', {
      headers: UA, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html);
    let inserted = 0;
    $('.relocation-listing, .relocation-item, .listing-item').each((_, el) => {
      const $el = $(el);
      const name = $el.find('.title, h3').first().text().trim();
      const from = $el.find('.from, .pickup').first().text().trim();
      const to = $el.find('.to, .dropoff').first().text().trim();
      if (!name && !from) return;
      const link = $el.find('a').first().attr('href') || '';
      const url = link.startsWith('http') ? link : `https://www.transfercar.co.nz${link}`;
      insertPoi({
        source: 'transfercar',
        external_id: url,
        category: 'relocation',
        name: name || `${from} → ${to}`,
        description: `${from} → ${to}`,
        country: 'NZ',
        url,
        payload: { from, to },
      }).then(ok => { if (ok) inserted++; }).catch(() => {});
    });
    await new Promise(r => setTimeout(r, 200));
    return { source: 'transfercar', inserted };
  } catch (err) {
    return { source: 'transfercar', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Imoova — relocations multi-país (NZ/AU/EU/USA)
// ════════════════════════════════════════════════════════════
async function fetchImoova() {
  try {
    const r = await fetch('https://www.imoova.com/en/relocations', {
      headers: UA, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html);
    let inserted = 0;
    $('article, .relocation-card, .listing').each((_, el) => {
      const $el = $(el);
      const name = $el.find('h2, h3, .title').first().text().trim();
      if (!name) return;
      const link = $el.find('a').first().attr('href') || '';
      const url = link.startsWith('http') ? link : `https://www.imoova.com${link}`;
      insertPoi({
        source: 'imoova',
        external_id: url,
        category: 'relocation',
        name,
        url,
      }).then(ok => { if (ok) inserted++; }).catch(() => {});
    });
    await new Promise(r => setTimeout(r, 200));
    return { source: 'imoova', inserted };
  } catch (err) {
    return { source: 'imoova', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  NZ vehicle compliance — Self-Contained Vehicle (SCV)
//  Plumber's Register / NZMCA for SCV cards
// ════════════════════════════════════════════════════════════
async function fetchNZVehicleCompliance() {
  try {
    // No public API; fetch NZTA news RSS for vehicle rule changes
    const Parser = require('rss-parser');
    const p = new Parser({ timeout: TIMEOUT, headers: UA });
    const feed = await p.parseURL('https://www.nzta.govt.nz/feed/news/');
    let inserted = 0;
    for (const it of (feed.items || []).slice(0, 30)) {
      if (!/vehicle|self.contained|wof|cof|registration|warrant/i.test(it.title || '')) continue;
      const ok = await insertPoi({
        source: 'nzta_news',
        external_id: it.guid || it.link,
        category: 'vehicle_compliance',
        name: it.title,
        description: (it.contentSnippet || '').slice(0, 1000),
        country: 'NZ',
        url: it.link,
      });
      if (ok) inserted++;
    }
    return { source: 'nzta_news', inserted };
  } catch (err) {
    return { source: 'nzta_news', error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  eSIMDB — comparator scrape (free, no auth)
// ════════════════════════════════════════════════════════════
async function fetchESIMDB({ country = 'NZ' } = {}) {
  try {
    const r = await fetch(`https://esimdb.com/${country.toLowerCase()}`, {
      headers: UA, signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html);
    let inserted = 0;
    $('table tbody tr, .esim-card').each((_, el) => {
      const $el = $(el);
      const provider = $el.find('td').eq(0).text().trim() || $el.find('.provider').text().trim();
      const data = $el.find('td').eq(1).text().trim() || $el.find('.data').text().trim();
      const price = $el.find('td').eq(2).text().trim() || $el.find('.price').text().trim();
      if (!provider) return;
      insertPoi({
        source: 'esimdb',
        external_id: `esimdb:${country}:${provider}:${data}`,
        category: 'esim',
        name: `${provider} — ${data} (${country})`,
        description: `Price: ${price}`,
        country,
        payload: { provider, data, price },
      }).then(ok => { if (ok) inserted++; }).catch(() => {});
    });
    await new Promise(r => setTimeout(r, 200));
    return { source: 'esimdb', country, inserted };
  } catch (err) {
    return { source: 'esimdb', error: err.message };
  }
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
  fetchAll,
  ensureLogisticsPois,
};
