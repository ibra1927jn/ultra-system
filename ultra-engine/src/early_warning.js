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

async function fetchAll() {
  const results = [];
  try { results.push(await fetchUSGSEarthquakes()); }
  catch (e) { results.push({ source: 'usgs', error: e.message }); }

  try { results.push(await fetchWHODons()); }
  catch (e) { results.push({ source: 'who_dons', error: e.message }); }

  try { results.push(await fetchACLED()); }
  catch (e) { results.push({ source: 'acled', error: e.message }); }

  return results;
}

module.exports = {
  fetchUSGSEarthquakes,
  fetchWHODons,
  fetchACLED,
  fetchAll,
  extractCountryISO,
};
