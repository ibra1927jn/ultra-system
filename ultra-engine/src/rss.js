// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — RSS Reader (reemplaza Miniflux)          ║
// ║  P1: Noticias — Fetch, scoring por keywords y alertas    ║
// ╚══════════════════════════════════════════════════════════╝

const Parser = require('rss-parser');
const db = require('./db');
const { computeArticleScore } = require('./utils/rss_scoring');

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
  return computeArticleScore(title, summary, keywords);
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
  return db.queryAll('SELECT * FROM rss_feeds WHERE is_active = TRUE ORDER BY name');
}

/**
 * Fetch articulos de un feed especifico con scoring
 * Retorna { newCount, highScoreArticles } para que el scheduler alerte
 */
async function fetchFeed(feedId) {
  const feed = await db.queryOne('SELECT * FROM rss_feeds WHERE id = $1', [feedId]);
  if (!feed) throw new Error(`Feed ${feedId} no encontrado`);

  try {
    const data = await parser.parseURL(feed.url);
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

        await db.query(
          `INSERT INTO rss_articles (feed_id, title, url, summary, published_at, relevance_score)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            feedId,
            title,
            item.link,
            summary,
            item.pubDate ? new Date(item.pubDate) : new Date(),
            score,
          ]
        );
        newCount++;

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

    console.debug(`📰 [${feed.name}] ${newCount} nuevos, ${highScoreArticles.length} relevantes`);
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

  console.debug(`📰 Total: ${totalNew} nuevos, ${allHighScore.length} relevantes`);
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
