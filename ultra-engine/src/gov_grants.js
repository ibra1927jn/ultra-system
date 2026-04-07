// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Government grants tracker (P5 Fase 3b)   ║
// ║                                                            ║
// ║  Fetchers RSS para programas gov de financiación:          ║
// ║   • BOE ayudas (España, todos los Ministerios)             ║
// ║   • CDTI (innovación tecnológica, NEOTEC)                  ║
// ║   • ENISA (préstamos participativos jóvenes/crecimiento)   ║
// ║                                                            ║
// ║  TODO Fase 3c: SEDIA EU (POST API), Callaghan NZ scrape,  ║
// ║  business.gov.au scrape.                                   ║
// ║                                                            ║
// ║  Persiste a opportunities con category='grant'.            ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const Parser = require('rss-parser');
const _parser = new Parser({ timeout: 20000, customFields: { item: ['enclosure', 'description'] } });

async function scoreText(text) {
  const kws = await db.queryAll('SELECT keyword, weight FROM rss_keywords');
  const lower = String(text || '').toLowerCase();
  let score = 0;
  for (const k of kws) {
    if (lower.includes(k.keyword.toLowerCase())) score += k.weight;
  }
  return score;
}

async function insertGrant({ title, source, url, description, externalId, postedAt, country, amount, currency, tags }) {
  if (!url) return false;
  const text = `${title} ${description || ''}`;
  const score = await scoreText(text);
  const r = await db.queryOne(
    `INSERT INTO opportunities
       (title, source, source_type, url, category, status, notes, description,
        payout_type, salary_min, salary_max, currency, tags, match_score,
        external_id, posted_at, last_seen)
     VALUES ($1, $2, 'gov_grant', $3, 'grant', 'new', $4, $5, 'grant', $6, $7, $8, $9, $10, $11, $12, NOW())
     ON CONFLICT (url) WHERE url IS NOT NULL DO UPDATE SET
       last_seen = NOW(),
       match_score = GREATEST(opportunities.match_score, EXCLUDED.match_score)
     RETURNING (xmax = 0) AS inserted`,
    [
      (title || '').slice(0, 500),
      source,
      url,
      country || null,
      (description || '').slice(0, 2000),
      amount || null,
      amount || null,
      currency || 'EUR',
      tags || null,
      score,
      externalId,
      postedAt || null,
    ]
  );
  return r?.inserted || false;
}

// ════════════════════════════════════════════════════════════
//  BOE — Boletín Oficial del Estado, sección "ayudas"
// ════════════════════════════════════════════════════════════
async function fetchBOEAyudas() {
  try {
    // BOE encoding ISO-8859-1; rss-parser puede manejar pero hay que asegurar
    const feed = await _parser.parseURL('https://www.boe.es/rss/canal.php?c=ayudas');
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items.slice(0, 50)) {
      // Tag detection: extracto de Resolución / convocatoria / subvención
      const text = `${it.title} ${it.contentSnippet || ''}`;
      // Skip si no parece convocatoria activa (ignora correcciones, anuncios)
      if (/correcci[oó]n|fe de erratas/i.test(it.title)) continue;
      const tags = [];
      if (/jóven|young|garantía juvenil/i.test(text)) tags.push('youth');
      if (/empresa|sme|pyme|startup/i.test(text)) tags.push('business');
      if (/inverso|innovaci[oó]n|i\+d/i.test(text)) tags.push('rd_innovation');
      if (/cripto|fintech|blockchain/i.test(text)) tags.push('fintech');
      if (/internacional|exporta/i.test(text)) tags.push('international');
      const ok = await insertGrant({
        title: it.title,
        source: 'BOE Ayudas',
        url: it.link,
        description: it.contentSnippet,
        externalId: `boe:${it.guid || it.link}`,
        postedAt: it.isoDate ? new Date(it.isoDate) : null,
        country: 'ES',
        currency: 'EUR',
        tags,
      });
      if (ok) inserted++;
    }
    return { source: 'boe_ayudas', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'boe_ayudas', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  CDTI — Centro Desarrollo Tecnológico Industrial
//  Programas: NEOTEC, PID, INNVIERTE, Eurostars
// ════════════════════════════════════════════════════════════
async function fetchCDTI() {
  try {
    const feed = await _parser.parseURL('https://www.cdti.es/rss');
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items) {
      const ok = await insertGrant({
        title: it.title,
        source: 'CDTI',
        url: it.link,
        description: it.contentSnippet,
        externalId: `cdti:${it.guid || it.link}`,
        postedAt: it.isoDate ? new Date(it.isoDate) : null,
        country: 'ES',
        currency: 'EUR',
        tags: ['rd_innovation', 'tech', 'cdti'],
      });
      if (ok) inserted++;
    }
    return { source: 'cdti', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'cdti', fetched: 0, inserted: 0, error: err.message };
  }
}

// ════════════════════════════════════════════════════════════
//  ENISA — Empresa Nacional de Innovación
//  Préstamos participativos jóvenes (hasta 75K€) + crecimiento
// ════════════════════════════════════════════════════════════
async function fetchENISA() {
  try {
    const feed = await _parser.parseURL('https://www.enisa.es/es/financiacion/rss');
    const items = feed.items || [];
    let inserted = 0;
    for (const it of items) {
      const ok = await insertGrant({
        title: it.title,
        source: 'ENISA',
        url: it.link,
        description: it.contentSnippet,
        externalId: `enisa:${it.guid || it.link}`,
        postedAt: it.isoDate ? new Date(it.isoDate) : null,
        country: 'ES',
        currency: 'EUR',
        tags: ['loan', 'startup', 'enisa'],
      });
      if (ok) inserted++;
    }
    return { source: 'enisa', fetched: items.length, inserted };
  } catch (err) {
    return { source: 'enisa', fetched: 0, inserted: 0, error: err.message };
  }
}

async function fetchAll() {
  const results = [];
  for (const fn of [fetchBOEAyudas, fetchCDTI, fetchENISA]) {
    try { results.push(await fn()); }
    catch (e) { results.push({ source: fn.name, error: e.message }); }
    await new Promise(r => setTimeout(r, 1500));
  }
  return results;
}

module.exports = { fetchBOEAyudas, fetchCDTI, fetchENISA, fetchAll };
