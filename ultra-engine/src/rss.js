// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — RSS Reader (reemplaza Miniflux)          ║
// ║  P1: Noticias — Fetch, scoring por keywords y alertas    ║
// ╚══════════════════════════════════════════════════════════╝

const Parser = require('rss-parser');
const db = require('./db');
const eventbus = require('./eventbus');

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'UltraSystem/1.0' },
});

// Umbral de relevancia para alertar via Telegram
const SCORE_THRESHOLD = 8;

// ═══════════════════════════════════════════════════════════
//  KEYWORD SCORING — Puntua articulos segun keywords en DB
// ═══════════════════════════════════════════════════════════

/**
 * Calcula score de relevancia para un articulo basado en keywords configurados
 * Busca coincidencias en titulo y summary, suma pesos
 */
async function scoreArticle(title, summary) {
  const keywords = await db.queryAll('SELECT keyword, weight FROM rss_keywords');
  if (!keywords.length) return 0;

  const text = `${title} ${summary}`.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    // Buscar keyword como palabra completa o substring
    if (text.includes(kw.keyword.toLowerCase())) {
      score += kw.weight;
    }
  }

  return score;
}

// ═══════════════════════════════════════════════════════════
//  KEYWORDS CRUD
// ═══════════════════════════════════════════════════════════

/**
 * Agrega un keyword con peso para scoring
 */
async function addKeyword(keyword, weight = 5) {
  return db.queryOne(
    `INSERT INTO rss_keywords (keyword, weight)
     VALUES ($1, $2)
     ON CONFLICT (keyword) DO UPDATE SET weight = $2
     RETURNING *`,
    [keyword.toLowerCase().trim(), Math.min(10, Math.max(1, parseInt(weight)))]
  );
}

/**
 * Lista todos los keywords configurados
 */
async function getKeywords() {
  return db.queryAll('SELECT * FROM rss_keywords ORDER BY weight DESC, keyword ASC');
}

/**
 * Elimina un keyword por id
 */
async function deleteKeyword(id) {
  const result = await db.queryOne('DELETE FROM rss_keywords WHERE id = $1 RETURNING *', [id]);
  return result;
}

// ═══════════════════════════════════════════════════════════
//  FEEDS CRUD + FETCH
// ═══════════════════════════════════════════════════════════

/**
 * Anade un nuevo feed RSS
 */
async function addFeed(url, name, category = 'general') {
  const result = await db.queryOne(
    `INSERT INTO rss_feeds (url, name, category)
     VALUES ($1, $2, $3)
     ON CONFLICT (url) DO UPDATE SET name = $2, category = $3
     RETURNING *`,
    [url, name, category]
  );
  return result;
}

/**
 * Obtiene todos los feeds
 */
async function getFeeds() {
  // Excluye pseudo-feeds — fetchers dedicados en news_apis.js los manejan
  // (gdelt, bsky, mastodon_search, apple_podcasts, podcast_index, reddit,
  // currents, newsdata, youtube_search, finlight, etc.). Filtramos por URL
  // en vez de lista de categorías para que nuevos pseudo-feeds queden
  // auto-excluidos sin tocar este código. Convención: pseudo-feeds tienen
  // url 'pseudo://...' y categoría real fetcheada por su módulo dedicado.
  return db.queryAll(
    `SELECT * FROM rss_feeds
     WHERE is_active = TRUE
       AND url NOT LIKE 'pseudo:%'
     ORDER BY name`
  );
}

/**
 * Fetch articulos de un feed especifico con scoring
 * Retorna { newCount, highScoreArticles } para que el scheduler alerte
 */
// R6 2026-04-08: fallback a Puppeteer sidecar cuando parseURL falla con
// 403/network error (típico en feeds CF-blocked desde Hetzner datacenter:
// Al Jazeera variants, Arab News, DailyRemote, Lablab, Opportunity*, etc.).
// Chromium real pasa el CF challenge y devuelve el XML raw; después
// parseamos con parser.parseString(). Primera llamada por feed: +2-4s
// vs parseURL directo. Sin impacto en feeds que ya funcionan via parseURL.
//
// B1 2026-04-09: ampliado para cubrir 2 modos extra de fallo descubiertos
// con feeds cross-pillar:
//   (a) WAF que devuelve 200/202 con body vacío o no-XML (ReliefWeb, BOE):
//       parseURL lanza "Unable to parse XML" → trigger fallback.
//   (b) Servidores que content-negotiate por UA/IP y devuelven HTML al
//       fetcher pero XML al navegador (Federal Register desde container):
//       parseURL lanza "Attribute without value" → trigger fallback.
// Y el fallback ahora usa `evaluate: fetch(url)` en page context en vez de
// `extract: text` (que devolvía body.innerText sin tags XML). Tras goto()
// los cookies CF están resueltos, fetch() desde la página los reutiliza
// y devuelve el RSS raw — el viewer XML de Chrome no contamina el body.
async function _parseUrlWithPuppeteerFallback(url) {
  try {
    return await parser.parseURL(url);
  } catch (err) {
    const msg = String(err?.message || err);
    // Triggers ampliados: CF/403/net + parser failures por content-neg/WAF
    const triggerRegex = /403|406|status code 4\d\d|CERT|ECONN|ETIMEDOUT|EAI_AGAIN|cloudflare|Unable to parse XML|Attribute without value|Non-whitespace before first tag/i;
    if (!triggerRegex.test(msg)) {
      throw err;
    }
    try {
      const pup = require('./puppeteer');
      if (!(await pup.isAvailable())) throw err;
      // fetch() in page context: reuses CF cookies resolved by page.goto(),
      // returns raw response body (not the rendered XML viewer DOM).
      const r = await pup.scrape({
        url,
        waitFor: 2500,
        evaluate: `fetch(${JSON.stringify(url)}, { credentials: 'include' }).then(r => r.text())`,
      });
      if (!r.ok) throw new Error(`puppeteer fallback: ${r.error}`);
      const xml = r.data || '';
      if (!xml.includes('<item') && !xml.includes('<entry')) {
        throw new Error('puppeteer fallback: body has no rss markers');
      }
      return await parser.parseString(xml);
    } catch (err2) {
      // Preferimos el error original — más informativo para debugging
      throw new Error(`${msg} (puppeteer fallback: ${err2.message})`);
    }
  }
}

async function fetchFeed(feedId) {
  const feed = await db.queryOne('SELECT * FROM rss_feeds WHERE id = $1', [feedId]);
  if (!feed) throw new Error(`Feed ${feedId} no encontrado`);

  try {
    const data = await _parseUrlWithPuppeteerFallback(feed.url);
    let newCount = 0;
    const highScoreArticles = [];

    for (const item of data.items.slice(0, 20)) {
      const existing = await db.queryOne(
        'SELECT id FROM rss_articles WHERE url = $1',
        [item.link]
      );

      if (!existing) {
        const title = item.title || 'Sin titulo';
        const summary = (item.contentSnippet || item.content || '').substring(0, 500);

        // Calcular score de relevancia
        const score = await scoreArticle(title, summary);

        const inserted = await db.queryOne(
          `INSERT INTO rss_articles (feed_id, title, url, summary, published_at, relevance_score)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            feedId,
            title,
            item.link,
            summary,
            (item.pubDate && !isNaN(new Date(item.pubDate).getTime())) ? new Date(item.pubDate) : new Date(),
            score,
          ]
        );
        newCount++;

        // B6 — Cross-pillar bridge: si el feed tiene target_pillar (P2/P3/P4/P5),
        // route to cross_pillar_intel + emit news.cpi event for downstream
        // pillar handlers. P1-pure feeds (target_pillar IS NULL) sin cambios.
        if (feed.target_pillar && inserted?.id) {
          try {
            await db.query(
              `INSERT INTO cross_pillar_intel
                 (article_id, feed_id, target_pillar, pillar_topic, title, url, summary, relevance_score)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (article_id, target_pillar) DO NOTHING`,
              [inserted.id, feedId, feed.target_pillar, feed.pillar_topic, title, item.link, summary, score]
            );
            await eventbus.publish('news.cpi', 'P1', {
              article_id: inserted.id,
              feed_id: feedId,
              feed_name: feed.name,
              target_pillar: feed.target_pillar,
              pillar_topic: feed.pillar_topic,
              title,
              url: item.link,
              summary,
              score,
            });
          } catch (cpiErr) {
            console.error(`bridge cpi insert/publish error (feed=${feed.name}):`, cpiErr.message);
          }
        }

        // Si supera el umbral, guardar para alertar
        if (score >= SCORE_THRESHOLD) {
          highScoreArticles.push({ title, url: item.link, score, feed: feed.name });
        }
      }
    }

    // Actualizar timestamp del feed
    await db.query(
      'UPDATE rss_feeds SET last_fetched = NOW() WHERE id = $1',
      [feedId]
    );

    console.log(`📰 [${feed.name}] ${newCount} nuevos, ${highScoreArticles.length} relevantes`);
    return { newCount, highScoreArticles };
  } catch (err) {
    console.error(`❌ Error fetching feed ${feed.name}:`, err.message);
    return { newCount: 0, highScoreArticles: [] };
  }
}

/**
 * Fetch todos los feeds activos con scoring
 * Retorna articulos de alta relevancia para alertar via Telegram
 */
async function fetchAll() {
  const feeds = await getFeeds();
  let totalNew = 0;
  const allHighScore = [];

  for (const feed of feeds) {
    const { newCount, highScoreArticles } = await fetchFeed(feed.id);
    totalNew += newCount;
    allHighScore.push(...highScoreArticles);
  }

  console.log(`📰 Total: ${totalNew} nuevos, ${allHighScore.length} relevantes`);
  return { totalNew, highScoreArticles: allHighScore };
}

/**
 * Obtiene articulos recientes (opcionalmente filtrado por feed y score minimo)
 */
async function getArticles(feedId, limit = 20) {
  const params = [limit];
  let where = '';

  if (feedId) {
    where = 'WHERE a.feed_id = $2';
    params.push(feedId);
  }

  return db.queryAll(
    `SELECT a.*, f.name as feed_name, f.category
     FROM rss_articles a
     JOIN rss_feeds f ON f.id = a.feed_id
     ${where}
     ORDER BY a.relevance_score DESC, a.published_at DESC
     LIMIT $1`,
    params
  );
}

module.exports = {
  addFeed, getFeeds, fetchFeed, fetchAll, getArticles,
  addKeyword, getKeywords, deleteKeyword, scoreArticle,
  SCORE_THRESHOLD,
};
