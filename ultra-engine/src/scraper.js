// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Web Scraper (reemplaza Changedetection)  ║
// ║  P2: Empleo — Vigila webs de ofertas de trabajo          ║
// ╚══════════════════════════════════════════════════════════╝

const cheerio = require('cheerio');
const db = require('./db');
const telegram = require('./telegram');
const { formatSalary } = require('./utils/salary_format');
const { buildAdzunaUrl, normalizeAdzunaJob, ADZUNA_USER_AGENT } = require('./utils/adzuna_params');

// Adzuna API — keys desde .env (registrarse en developer.adzuna.com)
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID || '';
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY || '';

/**
 * Añade una fuente de empleo para vigilar
 */
async function addSource(url, name, selector, region = 'NZ') {
  const result = await db.queryOne(
    `INSERT INTO job_sources (url, name, css_selector, region)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (url) DO UPDATE SET name = $2, css_selector = $3, region = $4
     RETURNING *`,
    [url, name, selector, region]
  );
  return result;
}

/**
 * Obtiene todas las fuentes activas
 */
async function getSources() {
  return db.queryAll('SELECT * FROM job_sources WHERE is_active = TRUE ORDER BY name');
}

/**
 * Scrape una fuente de empleo específica
 */
async function checkSource(sourceId) {
  const source = await db.queryOne('SELECT * FROM job_sources WHERE id = $1', [sourceId]);
  if (!source) throw new Error(`Fuente ${sourceId} no encontrada`);

  try {
    const response = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraSystem/1.0)' },
      signal: AbortSignal.timeout(15000),
    });

    const html = await response.text();
    const $ = cheerio.load(html);
    const contentHash = hashContent(html);

    // ¿Ha cambiado desde la última vez?
    if (contentHash === source.last_hash) {
      console.debug(`🔄 [${source.name}] Sin cambios`);
      return 0;
    }

    // Extraer ofertas usando el selector CSS configurado
    const listings = [];
    $(source.css_selector).each((i, el) => {
      const title = $(el).text().trim();
      const link = $(el).attr('href') || '';
      const fullLink = link.startsWith('http') ? link : new URL(link, source.url).href;

      if (title) {
        listings.push({ title, url: fullLink });
      }
    });

    // Guardar nuevas ofertas (ON CONFLICT evita SELECT+INSERT por cada una)
    let newCount = 0;
    for (const listing of listings.slice(0, 50)) {
      const result = await db.query(
        `INSERT INTO job_listings (source_id, title, url, region)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (url) DO NOTHING`,
        [sourceId, listing.title, listing.url, source.region]
      );
      if (result.rowCount > 0) newCount++;
    }

    // Actualizar hash y timestamp
    await db.query(
      'UPDATE job_sources SET last_hash = $1, last_checked = NOW() WHERE id = $2',
      [contentHash, sourceId]
    );

    // Notificar si hay nuevas ofertas
    if (newCount > 0) {
      const msg = [
        `💼 *Nuevas ofertas de empleo*`,
        `📍 ${source.name} (${source.region})`,
        `🆕 ${newCount} ofertas nuevas`,
        '',
        ...listings.slice(0, 5).map((l) => `• ${l.title}`),
        '',
        `🔗 [Ver más](${source.url})`,
      ].join('\n');
      await telegram.sendAlert(msg);
    }

    console.debug(`💼 [${source.name}] ${newCount} ofertas nuevas`);
    return newCount;
  } catch (err) {
    console.error(`❌ Error scraping ${source.name}:`, err.message);
    return 0;
  }
}

/**
 * Busca ofertas via Adzuna API (NZ)
 * Queries configuradas para packhouse, warehouse, team leader en Canterbury y Bay of Plenty
 */
async function fetchAdzuna() {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    console.debug('⚠️ Adzuna API keys no configuradas — saltando');
    return 0;
  }

  // Adzuna usa 'what_or' para buscar multiples keywords con OR
  const searches = [
    { what_or: 'warehouse packhouse', where: 'Christchurch', region: 'Christchurch', category: 'warehouse' },
    { what_or: 'team leader supervisor', where: 'Christchurch', region: 'Christchurch', category: 'warehouse' },
    { what_or: 'warehouse packhouse', where: 'Bay of Plenty', region: 'Bay of Plenty', category: 'warehouse' },
    { what_or: 'developer programmer IT', where: 'New Zealand', region: 'Remote NZ', category: 'tech' },
    { what_or: 'hospitality kitchen barista', where: 'Christchurch', region: 'Christchurch', category: 'hospitality' },
    { what_or: 'driver delivery logistics', where: 'Christchurch', region: 'Christchurch', category: 'logistics' },
    { what_or: 'construction labourer builder', where: 'Christchurch', region: 'Christchurch', category: 'construction' },
  ];

  let totalNew = 0;

  for (const search of searches) {
    try {
      const url = buildAdzunaUrl({ appId: ADZUNA_APP_ID, appKey: ADZUNA_APP_KEY, what_or: search.what_or, where: search.where });
      const response = await fetch(url, {
        headers: { 'User-Agent': ADZUNA_USER_AGENT },
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        console.error(`❌ Adzuna ${search.what_or}@${search.where}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const results = data.results || [];

      const source = await ensureAdzunaSource(search.what_or, search.region);
      let searchNew = 0;
      for (const job of results) {
        const { url: jobUrl, title, company, description: desc } = normalizeAdzunaJob(job);

        if (!title || !jobUrl) continue;

        const salary = formatSalary(job.salary_min, job.salary_max);
        const result = await db.query(
          `INSERT INTO job_listings (source_id, title, url, region, category, company, salary, description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (url) DO NOTHING`,
          [source.id, title, jobUrl, search.region, search.category || 'other', company || null, salary, desc]
        );
        if (result.rowCount > 0) searchNew++;
      }
      totalNew += searchNew;

      console.debug(`💼 Adzuna ${search.what_or}@${search.where}: ${results.length} resultados, ${searchNew} nuevos`);
    } catch (err) {
      console.error(`❌ Adzuna ${search.what_or}@${search.where}: ${err.message}`);
    }
  }

  // Notificar si hay nuevas ofertas
  if (totalNew > 0) {
    const msg = `💼 *Nuevas ofertas de empleo*\n🆕 ${totalNew} ofertas encontradas via Adzuna\n🔗 Ver en el dashboard`;
    await telegram.sendAlert(msg);
  }

  return totalNew;
}

/**
 * Crea o reutiliza una source virtual para Adzuna
 */
async function ensureAdzunaSource(keyword, region) {
  const name = `Adzuna — ${keyword} (${region})`;
  return db.queryOne(
    `INSERT INTO job_sources (url, name, css_selector, region)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (url) DO UPDATE SET name = $2
     RETURNING *`,
    [`https://api.adzuna.com/nz/${keyword}/${region}`, name, 'api', region]
  );
}

/**
 * Chequea todas las fuentes activas (Cheerio + Adzuna)
 */
async function checkAll() {
  let totalNew = 0;

  // Primero intentar Adzuna API (fuente principal)
  const adzunaNew = await fetchAdzuna();
  totalNew += adzunaNew;

  // Luego las fuentes Cheerio (si hay alguna que funcione)
  const sources = await getSources();
  for (const source of sources) {
    // Saltar fuentes Adzuna virtuales (css_selector = 'api')
    if (source.css_selector === 'api') continue;
    const count = await checkSource(source.id);
    totalNew += count;
  }

  console.debug(`💼 Total ofertas nuevas: ${totalNew}`);
  return totalNew;
}

/**
 * Obtiene ofertas recientes
 */
async function getListings(sourceId, limit = 20, category = null) {
  const params = [limit];
  const conditions = [];

  if (sourceId) {
    params.push(sourceId);
    conditions.push(`l.source_id = $${params.length}`);
  }

  if (category && category !== 'all') {
    params.push(category);
    conditions.push(`l.category = $${params.length}`);
  }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

  return db.queryAll(
    `SELECT l.*, s.name as source_name
     FROM job_listings l
     JOIN job_sources s ON s.id = l.source_id
     ${where}
     ORDER BY l.found_at DESC
     LIMIT $1`,
    params
  );
}

/**
 * Simple hash para detectar cambios
 */
function hashContent(content) {
  let hash = 0;
  const str = content.replace(/\s+/g, '').substring(0, 10000);
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Busqueda custom en Adzuna — el usuario escribe un query libre
 */
async function searchAdzuna(query, location = 'New Zealand') {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) return [];

  const url = buildAdzunaUrl({ appId: ADZUNA_APP_ID, appKey: ADZUNA_APP_KEY, what: query, where: location });
  const response = await fetch(url, {
    headers: { 'User-Agent': ADZUNA_USER_AGENT },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) return [];
  const data = await response.json();
  const results = data.results || [];
  let newCount = 0;

  const source = await ensureAdzunaSource(query, location);
  for (const job of results) {
    const { url: jobUrl, title, company, description: desc } = normalizeAdzunaJob(job);
    if (!title || !jobUrl) continue;

    const salary = formatSalary(job.salary_min, job.salary_max);
    const result = await db.query(
      `INSERT INTO job_listings (source_id, title, url, region, category, company, salary, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (url) DO NOTHING`,
      [source.id, title, jobUrl, location, 'custom', company || null, salary, desc]
    );
    if (result.rowCount > 0) newCount++;
  }

  return { total: results.length, new_listings: newCount };
}

module.exports = { addSource, getSources, checkSource, checkAll, getListings, fetchAdzuna, searchAdzuna, hashContent };
