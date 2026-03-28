// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Web Scraper (reemplaza Changedetection)  ║
// ║  P2: Empleo — Vigila webs de ofertas de trabajo          ║
// ╚══════════════════════════════════════════════════════════╝

const cheerio = require('cheerio');
const db = require('./db');
const telegram = require('./telegram');

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
      console.log(`🔄 [${source.name}] Sin cambios`);
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

    // Guardar nuevas ofertas
    let newCount = 0;
    for (const listing of listings.slice(0, 50)) {
      const exists = await db.queryOne(
        'SELECT id FROM job_listings WHERE url = $1',
        [listing.url]
      );
      if (!exists) {
        await db.query(
          `INSERT INTO job_listings (source_id, title, url, region)
           VALUES ($1, $2, $3, $4)`,
          [sourceId, listing.title, listing.url, source.region]
        );
        newCount++;
      }
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

    console.log(`💼 [${source.name}] ${newCount} ofertas nuevas`);
    return newCount;
  } catch (err) {
    console.error(`❌ Error scraping ${source.name}:`, err.message);
    return 0;
  }
}

/**
 * Chequea todas las fuentes activas
 */
async function checkAll() {
  const sources = await getSources();
  let totalNew = 0;

  for (const source of sources) {
    const count = await checkSource(source.id);
    totalNew += count;
  }

  console.log(`💼 Total ofertas nuevas: ${totalNew}`);
  return totalNew;
}

/**
 * Obtiene ofertas recientes
 */
async function getListings(sourceId, limit = 20) {
  const params = [limit];
  let where = '';

  if (sourceId) {
    where = 'WHERE l.source_id = $2';
    params.push(sourceId);
  }

  return db.queryAll(
    `SELECT l.*, s.name as source_name, s.region
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

module.exports = { addSource, getSources, checkSource, checkAll, getListings };
