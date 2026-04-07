// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — News APIs (P1)                           ║
// ║                                                          ║
// ║  Fuentes no-RSS para el Pilar 1:                         ║
// ║  • GDELT DOC 2.0 — global news + early warning (free)    ║
// ║  • Bluesky Search — social-as-news vía xrpc (free)       ║
// ║  • Stubs comentados: Currents / Newsdata / Finlight       ║
// ║                                                          ║
// ║  Todos los artículos se persisten en rss_articles con    ║
// ║  feed_id apuntando al pseudo-feed correspondiente.       ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const rss = require('./rss');

// ─── Resuelve el ID del pseudo-feed por categoría ─────────
async function pseudoFeedId(category) {
  const row = await db.queryOne(
    'SELECT id FROM rss_feeds WHERE category = $1 LIMIT 1',
    [category]
  );
  if (!row) {
    throw new Error(`Pseudo-feed con category=${category} no encontrado. Re-run init.sql.`);
  }
  return row.id;
}

// ─── Inserta artículo deduplicado por url ─────────────────
async function insertArticle(feedId, title, url, summary, publishedAt, score) {
  const existing = await db.queryOne(
    'SELECT id FROM rss_articles WHERE url = $1',
    [url]
  );
  if (existing) return false;

  await db.query(
    `INSERT INTO rss_articles (feed_id, title, url, summary, published_at, relevance_score)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [feedId, title, url, summary, publishedAt, score]
  );
  return true;
}

// ═══════════════════════════════════════════════════════════
//  GDELT DOC 2.0 — global news + early warning
//  Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
//  No auth, free, ventana 3 meses, 65 idiomas.
// ═══════════════════════════════════════════════════════════

const GDELT_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

/**
 * Construye query GDELT para todas las keywords activas (OR semántico).
 * Usa boolean operators de GDELT con OR explícito.
 */
async function buildGdeltQuery() {
  const kws = await db.queryAll('SELECT keyword FROM rss_keywords ORDER BY weight DESC LIMIT 10');
  if (!kws.length) return null;
  // Phrases con espacios → comillas. Limitamos a top 10 keywords para no explotar la URL.
  // GDELT requiere paréntesis cuando hay OR (parser exige terms grouped).
  const terms = kws.map(k => k.keyword.includes(' ') ? `"${k.keyword}"` : k.keyword);
  return terms.length === 1 ? terms[0] : `(${terms.join(' OR ')})`;
}

/**
 * Fetch artículos GDELT recientes que matchean nuestras keywords.
 * Limita a últimas 12h para evitar duplicar todo el corpus en cada run.
 */
async function fetchGdelt() {
  try {
    const query = await buildGdeltQuery();
    if (!query) {
      console.log('📭 [GDELT] Sin keywords configurados');
      return { newCount: 0, highScoreArticles: [] };
    }

    const params = new URLSearchParams({
      query,
      mode: 'ArtList',
      maxrecords: '50',
      format: 'json',
      timespan: '12h',     // últimas 12 horas
      sort: 'datedesc',
    });
    const url = `${GDELT_BASE}?${params}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'UltraSystem/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`GDELT HTTP ${res.status}`);

    // GDELT a veces devuelve text/plain con JSON dentro
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { articles: [] }; }
    const articles = data.articles || [];

    if (!articles.length) {
      console.log('📭 [GDELT] 0 artículos para la query actual');
      return { newCount: 0, highScoreArticles: [] };
    }

    const feedId = await pseudoFeedId('gdelt');
    let newCount = 0;
    const highScore = [];

    for (const a of articles) {
      const title = (a.title || 'GDELT untitled').substring(0, 500);
      const url = a.url;
      if (!url) continue;
      const summary = `${a.domain || ''} | ${a.language || ''} | ${a.sourcecountry || ''} | ${a.seendate || ''}`;
      const publishedAt = a.seendate ? parseGdeltDate(a.seendate) : new Date();

      // Score reusando el scorer existente (suma weights de keywords matched en title)
      const score = await rss.scoreArticle(title, summary);
      const inserted = await insertArticle(feedId, title, url, summary, publishedAt, score);
      if (inserted) {
        newCount++;
        if (score >= rss.SCORE_THRESHOLD) {
          highScore.push({ title, url, score, feed: 'GDELT' });
        }
      }
    }

    await db.query('UPDATE rss_feeds SET last_fetched = NOW() WHERE id = $1', [feedId]);
    console.log(`📰 [GDELT] ${newCount} nuevos, ${highScore.length} relevantes (de ${articles.length})`);
    return { newCount, highScoreArticles: highScore };
  } catch (err) {
    console.error('❌ [GDELT] Error:', err.message);
    return { newCount: 0, highScoreArticles: [] };
  }
}

// GDELT seendate format: '20260407T123000Z'
function parseGdeltDate(s) {
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return new Date();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
}

// ═══════════════════════════════════════════════════════════
//  BLUESKY SEARCH — social-as-news (xrpc public, free, no auth)
//  Endpoint: https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts
//  Docs: https://docs.bsky.app/docs/api/app-bsky-feed-search-posts
//
//  NOTA: La spec original P1 mencionaba "Jetstream firehose" (WebSocket
//  persistente con TODO el contenido). Para personal monitoring de keywords
//  específicas el search-poll es mucho más eficiente y encaja con cron.
//  Si en el futuro se quiere ingesta masiva real, sustituir por jetstream2
//  vía paquete `ws`.
// ═══════════════════════════════════════════════════════════

// NOTA: 'public.api.bsky.app' devuelve 403 desde rangos IP de Hetzner (Cloudflare block).
// 'api.bsky.app' funciona sin auth. Verificado 2026-04-07.
const BSKY_SEARCH = 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts';

/**
 * Hace una búsqueda Bluesky por cada keyword top-N y guarda posts nuevos.
 */
async function fetchBlueskySearch() {
  try {
    const kws = await db.queryAll('SELECT keyword FROM rss_keywords ORDER BY weight DESC LIMIT 5');
    if (!kws.length) return { newCount: 0, highScoreArticles: [] };

    const feedId = await pseudoFeedId('bsky');
    let totalNew = 0;
    const highScore = [];

    for (let i = 0; i < kws.length; i++) {
      const { keyword } = kws[i];
      if (i > 0) await new Promise(r => setTimeout(r, 500)); // throttle suave
      const params = new URLSearchParams({ q: keyword, limit: '15', sort: 'latest' });
      try {
        const res = await fetch(`${BSKY_SEARCH}?${params}`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; UltraSystem/1.0)',
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) {
          console.warn(`⚠️ [Bsky:${keyword}] HTTP ${res.status}`);
          continue;
        }
        const data = await res.json();
        const posts = data.posts || [];

        for (const p of posts) {
          const text = p.record?.text || '';
          if (!text) continue;
          const handle = p.author?.handle || 'unknown';
          const did = p.author?.did || '';
          // Construye URL canónica del post Bluesky
          const rkey = p.uri?.split('/').pop();
          const url = `https://bsky.app/profile/${handle}/post/${rkey}`;
          const title = `[@${handle}] ${text.substring(0, 200)}`;
          const summary = `Bsky · keyword: ${keyword} · likes:${p.likeCount || 0} reposts:${p.repostCount || 0} · ${did}`;
          const publishedAt = p.record?.createdAt ? new Date(p.record.createdAt) : new Date();

          // Score: usa rss scorer + bonus por engagement
          const baseScore = await rss.scoreArticle(text, '');
          const engagementBonus = Math.min(3, Math.floor((p.likeCount || 0) / 10));
          const score = baseScore + engagementBonus;

          const inserted = await insertArticle(feedId, title, url, summary, publishedAt, score);
          if (inserted) {
            totalNew++;
            if (score >= rss.SCORE_THRESHOLD) {
              highScore.push({ title, url, score, feed: 'Bluesky' });
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ [Bsky:${keyword}]`, err.message);
      }
    }

    await db.query('UPDATE rss_feeds SET last_fetched = NOW() WHERE id = $1', [feedId]);
    console.log(`🦋 [Bluesky] ${totalNew} nuevos, ${highScore.length} relevantes`);
    return { newCount: totalNew, highScoreArticles: highScore };
  } catch (err) {
    console.error('❌ [Bluesky] Error:', err.message);
    return { newCount: 0, highScoreArticles: [] };
  }
}

// ═══════════════════════════════════════════════════════════
//  STUBS comentados — requieren API keys del usuario
//  Activar añadiendo las keys correspondientes al .env
// ═══════════════════════════════════════════════════════════

/**
 * Currents API — 1,000 req/día free.
 * Activar: añadir CURRENTS_API_KEY al .env
 * Docs: https://currentsapi.services/en/docs/
 */
async function fetchCurrents() {
  const key = process.env.CURRENTS_API_KEY;
  if (!key) {
    return { newCount: 0, highScoreArticles: [], skipped: 'CURRENTS_API_KEY no configurada' };
  }
  // TODO cuando se añada la key:
  // const url = `https://api.currentsapi.services/v1/latest-news?apiKey=${key}&language=en`;
  // ... fetch + insert pattern como GDELT
  return { newCount: 0, highScoreArticles: [], skipped: 'Stub no implementado todavía' };
}

/**
 * Newsdata.io — 200 credits/día free, 12h delay.
 * Activar: añadir NEWSDATA_API_KEY al .env
 * Docs: https://newsdata.io/documentation
 */
async function fetchNewsdata() {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) {
    return { newCount: 0, highScoreArticles: [], skipped: 'NEWSDATA_API_KEY no configurada' };
  }
  return { newCount: 0, highScoreArticles: [], skipped: 'Stub no implementado todavía' };
}

/**
 * Finlight — 10K req/mes free, foco financiero/geopolítico.
 * Activar: añadir FINLIGHT_API_KEY al .env
 * Docs: https://finlight.me/docs
 */
async function fetchFinlight() {
  const key = process.env.FINLIGHT_API_KEY;
  if (!key) {
    return { newCount: 0, highScoreArticles: [], skipped: 'FINLIGHT_API_KEY no configurada' };
  }
  return { newCount: 0, highScoreArticles: [], skipped: 'Stub no implementado todavía' };
}

module.exports = {
  fetchGdelt,
  fetchBlueskySearch,
  fetchCurrents,
  fetchNewsdata,
  fetchFinlight,
};
