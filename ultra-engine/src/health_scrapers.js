// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Health/Outbreak Scrapers (P7)            ║
// ║                                                          ║
// ║  Fuentes (todas free, no auth):                          ║
// ║   • WHO DON RSS — disease outbreak news global           ║
// ║   • CDC Travel Advisories                                ║
// ║   • ECDC weekly threat reports                           ║
// ║   • MAEC España (recomendaciones de viaje)               ║
// ║                                                          ║
// ║  Persiste en health_alerts UNIQUE(url) → idempotente.    ║
// ╚══════════════════════════════════════════════════════════╝

const Parser = require('rss-parser');
const db = require('./db');

const parser = new Parser({
  timeout: 20000,
  headers: { 'User-Agent': 'UltraSystem/1.0 (compatible; HealthMonitor)' },
});

const SOURCES = [
  {
    name: 'WHO',
    // 2026-04-07: el feed RSS específico de DON (Disease Outbreak News) devuelve 404.
    // El feed general de news-english SÍ funciona y contiene los DONs entre otras news.
    // Para filtrar solo outbreaks, el extractDisease() del scoring filtra ya por keyword.
    url: 'https://www.who.int/rss-feeds/news-english.xml',
    level: 'warning',
    extractCountry: (item) => detectCountryISO(item.title + ' ' + (item.contentSnippet || '')),
  },
  {
    name: 'CDC',
    url: 'https://tools.cdc.gov/api/v2/resources/media/132608.rss',
    level: 'warning',
    extractCountry: (item) => detectCountryISO(item.title + ' ' + (item.contentSnippet || '')),
  },
  {
    name: 'ECDC',
    url: 'https://www.ecdc.europa.eu/en/taxonomy/term/3015/feed',
    level: 'info',
    extractCountry: () => 'EU',
  },
  // MAEC España no tiene RSS oficial — se puede añadir scraper Cheerio luego
];

// Mapeo simple de country names → ISO. Solo los más comunes;
// para 195 países completos usar i18n-iso-countries (paquete extra).
const COUNTRY_NAMES = {
  'algeria': 'DZ', 'morocco': 'MA', 'tunisia': 'TN', 'egypt': 'EG',
  'spain': 'ES', 'france': 'FR', 'germany': 'DE', 'italy': 'IT',
  'united kingdom': 'GB', 'uk': 'GB', 'ireland': 'IE',
  'new zealand': 'NZ', 'australia': 'AU',
  'thailand': 'TH', 'vietnam': 'VN', 'cambodia': 'KH', 'laos': 'LA',
  'indonesia': 'ID', 'philippines': 'PH', 'malaysia': 'MY',
  'india': 'IN', 'china': 'CN', 'japan': 'JP', 'south korea': 'KR',
  'usa': 'US', 'united states': 'US', 'canada': 'CA',
  'mexico': 'MX', 'brazil': 'BR', 'argentina': 'AR', 'chile': 'CL',
  'colombia': 'CO', 'peru': 'PE', 'ecuador': 'EC', 'bolivia': 'BO',
  'kenya': 'KE', 'tanzania': 'TZ', 'south africa': 'ZA', 'nigeria': 'NG',
  'turkey': 'TR', 'israel': 'IL', 'lebanon': 'LB', 'jordan': 'JO',
  'saudi arabia': 'SA', 'uae': 'AE', 'iran': 'IR', 'iraq': 'IQ',
  'russia': 'RU', 'ukraine': 'UA', 'poland': 'PL',
  'congo': 'CD', 'drc': 'CD', 'sudan': 'SD', 'ethiopia': 'ET',
  'mongolia': 'MN', 'nepal': 'NP', 'pakistan': 'PK', 'bangladesh': 'BD',
};

function detectCountryISO(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const [name, iso] of Object.entries(COUNTRY_NAMES)) {
    if (lower.includes(name)) return iso;
  }
  return null;
}

function extractDisease(text) {
  if (!text) return null;
  const known = ['cholera', 'ebola', 'marburg', 'mpox', 'monkeypox', 'dengue', 'malaria', 'measles',
                 'covid', 'influenza', 'h5n1', 'avian flu', 'polio', 'yellow fever', 'zika',
                 'chikungunya', 'meningitis', 'plague', 'typhoid', 'diphtheria', 'rabies', 'lassa',
                 'nipah', 'rift valley', 'leishmaniasis', 'crimean'];
  const lower = text.toLowerCase();
  for (const d of known) {
    if (lower.includes(d)) return d;
  }
  return null;
}

/**
 * Fetch all sources, store new alerts in health_alerts.
 * Retorna { totalNew, bySource } para que el scheduler pueda alertar.
 */
async function fetchAll() {
  let totalNew = 0;
  const bySource = {};

  for (const src of SOURCES) {
    try {
      const data = await parser.parseURL(src.url);
      let count = 0;

      for (const item of (data.items || []).slice(0, 30)) {
        const url = item.link;
        if (!url) continue;
        const title = (item.title || '').substring(0, 500);
        const description = (item.contentSnippet || item.content || '').substring(0, 1000);
        const country = src.extractCountry(item);
        const disease = extractDisease(`${title} ${description}`);
        const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();

        const r = await db.queryOne(
          `INSERT INTO health_alerts
             (source, country_iso, alert_level, disease, title, description, url, published_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (url) DO NOTHING
           RETURNING id`,
          [src.name, country, src.level, disease, title, description, url, publishedAt]
        );
        if (r) count++;
      }

      bySource[src.name] = count;
      totalNew += count;
      console.log(`🩺 [${src.name}] ${count} nuevas alertas`);
    } catch (err) {
      console.warn(`⚠️ [${src.name}]`, err.message);
      bySource[src.name] = { error: err.message };
    }
  }

  return { totalNew, bySource };
}

/**
 * Lista alertas recientes para país (o globales).
 */
async function listAlerts(countryIso = null, limit = 20) {
  if (countryIso) {
    return db.queryAll(
      `SELECT * FROM health_alerts
       WHERE country_iso = $1 OR country_iso IS NULL
       ORDER BY published_at DESC NULLS LAST, fetched_at DESC LIMIT $2`,
      [countryIso, limit]
    );
  }
  return db.queryAll(
    `SELECT * FROM health_alerts ORDER BY published_at DESC NULLS LAST, fetched_at DESC LIMIT $1`,
    [limit]
  );
}

module.exports = { fetchAll, listAlerts, detectCountryISO };
