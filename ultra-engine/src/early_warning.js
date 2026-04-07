// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Early warning feeds (P1 Fase 2)          ║
// ║                                                            ║
// ║  Fetchers free no-auth para events_store:                 ║
// ║   - USGS earthquakes (GeoJSON)                             ║
// ║   - WHO Disease Outbreak News (RSS)                        ║
// ║   - ACLED conflict events (REQUIERE registro free + token)║
// ║                                                            ║
// ║  Persiste a events_store con UNIQUE (source, external_id)  ║
// ║  para idempotencia. Severity inferida por magnitude.       ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 15000 });

// Mapping ISO2 country codes para WHO events que vienen con nombre
const COUNTRY_NAMES = {
  'algeria': 'DZ', 'morocco': 'MA', 'tunisia': 'TN', 'egypt': 'EG',
  'spain': 'ES', 'france': 'FR', 'germany': 'DE', 'italy': 'IT',
  'united kingdom': 'GB', 'uk': 'GB', 'united states': 'US', 'usa': 'US',
  'new zealand': 'NZ', 'australia': 'AU', 'canada': 'CA', 'mexico': 'MX',
  'brazil': 'BR', 'china': 'CN', 'india': 'IN', 'japan': 'JP', 'korea': 'KR',
  'indonesia': 'ID', 'philippines': 'PH', 'thailand': 'TH', 'vietnam': 'VN',
  'malaysia': 'MY', 'singapore': 'SG', 'turkey': 'TR', 'russia': 'RU',
  'pakistan': 'PK', 'iran': 'IR', 'iraq': 'IQ', 'syria': 'SY', 'yemen': 'YE',
  'sudan': 'SD', 'south sudan': 'SS', 'ethiopia': 'ET', 'kenya': 'KE',
  'nigeria': 'NG', 'ukraine': 'UA', 'israel': 'IL', 'palestine': 'PS',
  'lebanon': 'LB', 'jordan': 'JO', 'saudi arabia': 'SA', 'uae': 'AE',
};

function extractCountryISO(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [name, iso] of Object.entries(COUNTRY_NAMES)) {
    if (lower.includes(name)) return iso;
  }
  return null;
}

// ════════════════════════════════════════════════════════════
//  USGS — Earthquakes (GeoJSON, free, no auth)
// ════════════════════════════════════════════════════════════
async function fetchUSGSEarthquakes({ minMagnitude = 4.5, period = 'week' } = {}) {
  // period: 'hour'|'day'|'week'|'month'. Magnitudes: 'significant'|4.5|2.5|1.0|all
  // BUG FIX 2026-04-07: default era '7day' (URL inválida), USGS responde "null" → JSON.parse falla
  const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${minMagnitude}_${period}.geojson`;
  // Force gzip/identity (no brotli) — undici fetch tiene un bug intermitente decodificando br
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, deflate' },
  });
  if (!r.ok) throw new Error(`USGS ${r.status}`);
  const text = await r.text();
  const data = JSON.parse(text);
  let inserted = 0;

  for (const feature of (data.features || [])) {
    const props = feature.properties;
    const coords = feature.geometry?.coordinates || [];
    const mag = parseFloat(props.mag) || 0;
    const severity = mag >= 7 ? 'critical' : mag >= 6 ? 'high' : mag >= 5 ? 'medium' : 'low';
    const country = extractCountryISO(props.place);

    const result = await db.queryOne(
      `INSERT INTO events_store
       (source, external_id, event_type, severity, title, country, latitude, longitude,
        magnitude, occurred_at, url, payload)
       VALUES ('usgs', $1, 'earthquake', $2, $3, $4, $5, $6, $7, to_timestamp($8), $9, $10)
       ON CONFLICT (source, external_id) DO NOTHING
       RETURNING id`,
      [
        feature.id,
        severity,
        `M${mag} ${props.place || 'Unknown location'}`,
        country,
        coords[1] || null,
        coords[0] || null,
        mag,
        (props.time || 0) / 1000,
        props.url,
        JSON.stringify({ tsunami: props.tsunami, alert: props.alert, depth: coords[2] }),
      ]
    );
    if (result) inserted++;
  }
  return { source: 'usgs', fetched: data.features?.length || 0, inserted };
}

// ════════════════════════════════════════════════════════════
//  WHO Disease Outbreak News (RSS feed)
// ════════════════════════════════════════════════════════════
async function fetchWHODons() {
  // WHO DONS feed: news-english.xml es general; csr/don es DON-específico pero
  // ya está cubierto en P7. Aquí enfocamos en alerts globales que afectan al usuario.
  const feeds = [
    'https://www.who.int/rss-feeds/news-english.xml',
  ];
  let inserted = 0;
  let fetched = 0;

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of (feed.items || [])) {
        fetched++;
        const country = extractCountryISO(item.title + ' ' + (item.contentSnippet || ''));
        const isDisease = /(outbreak|virus|disease|epidemic|pandemic|cholera|ebola|mpox|dengue|measles|h5n1|influenza)/i
          .test(item.title + ' ' + (item.contentSnippet || ''));
        if (!isDisease) continue;

        const result = await db.queryOne(
          `INSERT INTO events_store
           (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
           VALUES ('who_dons', $1, 'disease_outbreak', $2, $3, $4, $5, $6, $7)
           ON CONFLICT (source, external_id) DO NOTHING
           RETURNING id`,
          [
            item.guid || item.link,
            'medium',
            (item.title || '').slice(0, 500),
            (item.contentSnippet || '').slice(0, 1000),
            country,
            item.isoDate || new Date(),
            item.link,
          ]
        );
        if (result) inserted++;
      }
    } catch (err) {
      console.warn(`WHO DONS fetch ${url} failed:`, err.message);
    }
  }
  return { source: 'who_dons', fetched, inserted };
}

// ════════════════════════════════════════════════════════════
//  ACLED — Conflict events (requires free API key)
// ════════════════════════════════════════════════════════════
async function fetchACLED({ days = 7, countries = ['DZ', 'TN', 'MA'] } = {}) {
  const apiKey = process.env.ACLED_API_KEY;
  const email = process.env.ACLED_EMAIL;
  if (!apiKey || !email) {
    return {
      source: 'acled', configured: false,
      reason: 'ACLED_API_KEY + ACLED_EMAIL no configurados (registro free en acleddata.com)',
    };
  }

  const dateFrom = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];
  const isoToCountry = { DZ: 'Algeria', TN: 'Tunisia', MA: 'Morocco', LY: 'Libya', EG: 'Egypt' };
  const cnames = countries.map(c => isoToCountry[c]).filter(Boolean).join('|');

  const url = `https://api.acleddata.com/acled/read?key=${apiKey}&email=${email}&country=${encodeURIComponent(cnames)}&event_date=${dateFrom}|${new Date().toISOString().split('T')[0]}&event_date_where=BETWEEN&limit=200`;

  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`ACLED ${r.status}`);
    const data = await r.json();
    let inserted = 0;
    for (const ev of (data.data || [])) {
      const fatalities = parseInt(ev.fatalities || '0', 10);
      const severity = fatalities >= 50 ? 'critical' : fatalities >= 10 ? 'high' : fatalities > 0 ? 'medium' : 'low';
      const country = Object.entries(isoToCountry).find(([_, name]) => name === ev.country)?.[0];

      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, region,
          latitude, longitude, magnitude, occurred_at, payload)
         VALUES ('acled', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [
          ev.event_id_cnty || ev.data_id,
          ev.event_type || 'conflict',
          severity,
          `${ev.event_type}: ${ev.location || 'unknown'}`,
          ev.notes || '',
          country,
          ev.admin1,
          parseFloat(ev.latitude) || null,
          parseFloat(ev.longitude) || null,
          fatalities,
          ev.event_date,
          JSON.stringify({ actor1: ev.actor1, actor2: ev.actor2, sub_event_type: ev.sub_event_type }),
        ]
      );
      if (result) inserted++;
    }
    return { source: 'acled', configured: true, fetched: data.data?.length || 0, inserted };
  } catch (err) {
    return { source: 'acled', configured: true, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  ReliefWeb — UN OCHA humanitarian disasters
// ════════════════════════════════════════════════════════════
async function fetchReliefWeb() {
  try {
    // rss-parser parseURL falla con esta feed; usar fetch + parseString
    const r = await fetch('https://reliefweb.int/disasters/rss.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text);
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 30)) {
      const country = extractCountryISO(`${it.title} ${it.contentSnippet || ''}`);
      // Severity inference from title keywords
      const text = (it.title || '').toLowerCase();
      let severity = 'medium';
      if (/red|critical|disaster|emergency|catastroph/i.test(text)) severity = 'high';
      if (/major|severe|earthquake|tsunami|cyclone/i.test(text)) severity = 'critical';

      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('reliefweb', $1, 'humanitarian', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [
          it.guid || it.link,
          severity,
          (it.title || '').slice(0, 500),
          (it.contentSnippet || '').slice(0, 1000),
          country,
          it.isoDate || new Date(),
          it.link,
        ]
      );
      if (result) inserted++;
    }
    return { source: 'reliefweb', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'reliefweb', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  NOAA — US National Weather Service alerts (GeoJSON API)
// ════════════════════════════════════════════════════════════
async function fetchNOAA() {
  try {
    const r = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert', {
      headers: { Accept: 'application/geo+json', 'User-Agent': 'UltraSystem/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`NOAA HTTP ${r.status}`);
    const data = await r.json();
    const features = data.features || [];
    let inserted = 0;
    for (const f of features.slice(0, 50)) {
      const p = f.properties || {};
      const text = (p.event || '').toLowerCase();
      let severity = 'low';
      if (/warning/i.test(text) || p.severity === 'Severe') severity = 'high';
      if (/extreme|emergency|tornado|hurricane/i.test(text) || p.severity === 'Extreme') severity = 'critical';

      // Extraer coords del primer point del polygon
      let lat = null, lon = null;
      const geom = f.geometry;
      if (geom?.type === 'Polygon' && geom.coordinates?.[0]?.[0]) {
        [lon, lat] = geom.coordinates[0][0];
      }

      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, latitude, longitude, occurred_at, url)
         VALUES ('noaa', $1, 'weather_alert', $2, $3, $4, 'US', $5, $6, $7, $8)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [
          p.id || f.id,
          severity,
          (p.headline || p.event || '').slice(0, 500),
          (p.description || '').slice(0, 1000),
          lat, lon,
          p.sent || p.effective || new Date(),
          `https://api.weather.gov/alerts/${p.id || f.id}`,
        ]
      );
      if (result) inserted++;
    }
    return { source: 'noaa', fetched: features.length, inserted };
  } catch (err) {
    return { source: 'noaa', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  GDACS — Global Disaster Alert Coordination System (UN)
//  Updates every 6 minutes; earthquakes/cyclones/floods/volcanoes
// ════════════════════════════════════════════════════════════
async function fetchGDACS() {
  try {
    const r = await fetch('https://www.gdacs.org/xml/rss.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text);
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 30)) {
      const title = it.title || '';
      // Severity from GDACS alert level prefix (Green/Orange/Red)
      let severity = 'low';
      if (/red alert/i.test(title)) severity = 'critical';
      else if (/orange alert/i.test(title)) severity = 'high';
      else if (/green alert/i.test(title)) severity = 'medium';

      // Event type detection
      let eventType = 'disaster';
      if (/earthquake/i.test(title)) eventType = 'earthquake';
      else if (/cyclone|hurricane|typhoon/i.test(title)) eventType = 'cyclone';
      else if (/flood/i.test(title)) eventType = 'flood';
      else if (/volcano/i.test(title)) eventType = 'volcano';
      else if (/wildfire|fire/i.test(title)) eventType = 'wildfire';
      else if (/drought/i.test(title)) eventType = 'drought';

      const country = extractCountryISO(title);
      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('gdacs', $1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [it.guid || it.link, eventType, severity, title.slice(0, 500),
         (it.contentSnippet || '').slice(0, 1000), country,
         it.isoDate || new Date(), it.link]
      );
      if (result) inserted++;
    }
    return { source: 'gdacs', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'gdacs', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  International Crisis Group — conflict reports + briefings
// ════════════════════════════════════════════════════════════
async function fetchCrisisGroup() {
  try {
    const r = await fetch('https://www.crisisgroup.org/rss.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text);
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 30)) {
      const country = extractCountryISO(`${it.title} ${it.contentSnippet || ''}`);
      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('crisis_group', $1, 'conflict', 'medium', $2, $3, $4, $5, $6)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [it.guid || it.link, (it.title || '').slice(0, 500),
         (it.contentSnippet || '').slice(0, 1000), country,
         it.isoDate || new Date(), it.link]
      );
      if (result) inserted++;
    }
    return { source: 'crisis_group', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'crisis_group', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  US State Dept Travel Advisories (RSS)
// ════════════════════════════════════════════════════════════
async function fetchUSStateDept() {
  try {
    const r = await fetch('https://travel.state.gov/_res/rss/TAsTWs.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text).catch(() => ({ items: [] }));
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 50)) {
      const title = it.title || '';
      // Title format usually: "Country - Level N: Description"
      const levelMatch = title.match(/Level\s*(\d)/i);
      let severity = 'low';
      if (levelMatch) {
        const lvl = parseInt(levelMatch[1], 10);
        severity = lvl === 4 ? 'critical' : lvl === 3 ? 'high' : lvl === 2 ? 'medium' : 'low';
      }
      const country = extractCountryISO(title);
      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('us_state_dept', $1, 'travel_advisory', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [it.guid || it.link, severity, title.slice(0, 500),
         (it.contentSnippet || '').slice(0, 1000), country,
         it.isoDate || new Date(), it.link]
      );
      if (result) inserted++;
    }
    return { source: 'us_state_dept', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'us_state_dept', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  CDC Travel Notices RSS
// ════════════════════════════════════════════════════════════
async function fetchCDCTravelNotices() {
  try {
    const r = await fetch('https://wwwnc.cdc.gov/travel/rss/notices.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text).catch(() => ({ items: [] }));
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 30)) {
      const title = it.title || '';
      // CDC levels: Watch (1), Alert (2), Warning (3)
      let severity = 'medium';
      if (/warning|level 3/i.test(title)) severity = 'high';
      else if (/alert|level 2/i.test(title)) severity = 'medium';
      else if (/watch|level 1/i.test(title)) severity = 'low';

      const country = extractCountryISO(title);
      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('cdc_travel', $1, 'health_travel_notice', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source, external_id) DO NOTHING
         RETURNING id`,
        [it.guid || it.link, severity, title.slice(0, 500),
         (it.contentSnippet || '').slice(0, 1000), country,
         it.isoDate || new Date(), it.link]
      );
      if (result) inserted++;
    }
    return { source: 'cdc_travel', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'cdc_travel', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  ProMED-mail — disease outbreak posts (RSS via promedmail.org)
// ════════════════════════════════════════════════════════════
async function fetchProMED() {
  try {
    const r = await fetch('https://promedmail.org/promed-posts/feed/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text).catch(() => ({ items: [] }));
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 30)) {
      const title = it.title || '';
      const country = extractCountryISO(`${title} ${it.contentSnippet || ''}`);
      let severity = 'medium';
      if (/fatal|outbreak|epidemic/i.test(title)) severity = 'high';
      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('promed', $1, 'disease_outbreak', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
        [it.guid || it.link, severity, title.slice(0, 500),
         (it.contentSnippet || '').slice(0, 1000), country,
         it.isoDate || new Date(), it.link]
      );
      if (result) inserted++;
    }
    return { source: 'promed', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'promed', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  FEWS NET — Famine Early Warning Systems Network (USAID)
//  Food security alerts Africa/Yemen/Afghanistan/Caribbean
// ════════════════════════════════════════════════════════════
async function fetchFEWSNET() {
  try {
    const r = await fetch('https://fews.net/rss.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text).catch(() => ({ items: [] }));
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 30)) {
      const title = it.title || '';
      const country = extractCountryISO(`${title} ${it.contentSnippet || ''}`);
      let severity = 'medium';
      if (/famine|emergency|ipc 4|ipc 5/i.test(title + (it.contentSnippet || ''))) severity = 'critical';
      else if (/crisis|ipc 3/i.test(title + (it.contentSnippet || ''))) severity = 'high';
      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('fews_net', $1, 'food_security', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
        [it.guid || it.link, severity, title.slice(0, 500),
         (it.contentSnippet || '').slice(0, 1000), country,
         it.isoDate || new Date(), it.link]
      );
      if (result) inserted++;
    }
    return { source: 'fews_net', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'fews_net', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  Smartraveller (Australia DFAT) — travel advisories RSS
// ════════════════════════════════════════════════════════════
async function fetchSmartraveller() {
  try {
    const r = await fetch('https://www.smartraveller.gov.au/countries/rss.xml', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    const feed = await parser.parseString(text).catch(() => ({ items: [] }));
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 50)) {
      const title = it.title || '';
      // AU levels: 1=normal, 2=high caution, 3=reconsider, 4=do not travel
      let severity = 'low';
      if (/do not travel|level 4/i.test(title)) severity = 'critical';
      else if (/reconsider|level 3/i.test(title)) severity = 'high';
      else if (/high.+caution|level 2/i.test(title)) severity = 'medium';
      const country = extractCountryISO(title);
      const result = await db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, summary, country, occurred_at, url)
         VALUES ('smartraveller', $1, 'travel_advisory', $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
        [it.guid || it.link, severity, title.slice(0, 500),
         (it.contentSnippet || '').slice(0, 1000), country,
         it.isoDate || new Date(), it.link]
      );
      if (result) inserted++;
    }
    return { source: 'smartraveller', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'smartraveller', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  MAEC España — Recomendaciones de viaje (HTML scraper)
//  Sitio: exteriores.gob.es; no expone RSS oficial → scrape
// ════════════════════════════════════════════════════════════
async function fetchMAECEspana() {
  try {
    const cheerio = require('cheerio');
    const r = await fetch('https://www.exteriores.gob.es/es/ServiciosAlCiudadano/Paginas/Recomendaciones-de-viaje.aspx', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraBot/1.0)' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const html = await r.text();
    const $ = cheerio.load(html);
    let inserted = 0;
    let fetched = 0;
    // Sitio renderiza listas con anchors a /es/...PaisViaje/Paginas/{country}.aspx
    $('a[href*="PaisViaje"]').each((_, el) => {
      const href = $(el).attr('href');
      const country = $(el).text().trim();
      if (!country || !href) return;
      fetched++;
      // No tenemos detalle de severidad sin scrape extra. Marcamos como info.
      const url = href.startsWith('http') ? href : `https://www.exteriores.gob.es${href}`;
      const iso = extractCountryISO(country);
      // External ID estable por URL
      db.queryOne(
        `INSERT INTO events_store
         (source, external_id, event_type, severity, title, country, occurred_at, url)
         VALUES ('maec_es', $1, 'travel_advisory', 'low', $2, $3, NOW(), $4)
         ON CONFLICT (source, external_id) DO NOTHING RETURNING id`,
        [url, `MAEC ES — ${country}`, iso, url]
      ).then(res => { if (res) inserted++; }).catch(() => {});
    });
    // Wait microtasks
    await new Promise(r => setTimeout(r, 200));
    return { source: 'maec_es', fetched, inserted };
  } catch (err) {
    return { source: 'maec_es', fetched: 0, inserted: 0, error: err.message };
  }
}

async function fetchAll() {
  const results = [];
  try { results.push(await fetchUSGSEarthquakes()); }
  catch (e) { results.push({ source: 'usgs', error: e.message }); }

  try { results.push(await fetchWHODons()); }
  catch (e) { results.push({ source: 'who_dons', error: e.message }); }

  try { results.push(await fetchACLED()); }
  catch (e) { results.push({ source: 'acled', error: e.message }); }

  try { results.push(await fetchReliefWeb()); }
  catch (e) { results.push({ source: 'reliefweb', error: e.message }); }

  try { results.push(await fetchNOAA()); }
  catch (e) { results.push({ source: 'noaa', error: e.message }); }

  try { results.push(await fetchGDACS()); }
  catch (e) { results.push({ source: 'gdacs', error: e.message }); }

  try { results.push(await fetchCrisisGroup()); }
  catch (e) { results.push({ source: 'crisis_group', error: e.message }); }

  try { results.push(await fetchUSStateDept()); }
  catch (e) { results.push({ source: 'us_state_dept', error: e.message }); }

  try { results.push(await fetchCDCTravelNotices()); }
  catch (e) { results.push({ source: 'cdc_travel', error: e.message }); }

  try { results.push(await fetchProMED()); }
  catch (e) { results.push({ source: 'promed', error: e.message }); }

  try { results.push(await fetchFEWSNET()); }
  catch (e) { results.push({ source: 'fews_net', error: e.message }); }

  try { results.push(await fetchSmartraveller()); }
  catch (e) { results.push({ source: 'smartraveller', error: e.message }); }

  try { results.push(await fetchMAECEspana()); }
  catch (e) { results.push({ source: 'maec_es', error: e.message }); }

  return results;
}

module.exports = {
  fetchUSGSEarthquakes,
  fetchWHODons,
  fetchACLED,
  fetchReliefWeb,
  fetchNOAA,
  fetchGDACS,
  fetchCrisisGroup,
  fetchUSStateDept,
  fetchCDCTravelNotices,
  fetchProMED,
  fetchFEWSNET,
  fetchSmartraveller,
  fetchMAECEspana,
  fetchAll,
  extractCountryISO,
};
