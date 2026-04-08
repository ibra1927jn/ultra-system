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

// ─── Helper: ensure pseudo-feed exists for an API source ───
async function ensurePseudoFeed(category, name) {
  let row = await db.queryOne('SELECT id FROM rss_feeds WHERE category = $1 LIMIT 1', [category]);
  if (!row) {
    row = await db.queryOne(
      `INSERT INTO rss_feeds (url, name, category, is_active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [`pseudo://${category}`, name, category]
    );
  }
  return row.id;
}

// Helper: scoring usando rss_keywords (mismo modelo que GDELT)
async function scoreArticleText(text) {
  const kws = await db.queryAll('SELECT keyword, weight FROM rss_keywords');
  let score = 0;
  const lower = String(text || '').toLowerCase();
  for (const k of kws) {
    if (lower.includes(k.keyword.toLowerCase())) score += k.weight;
  }
  return score;
}

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
  try {
    const url = `https://api.currentsapi.services/v1/latest-news?apiKey=${key}&language=en`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Currents HTTP ${r.status}`);
    const data = await r.json();
    const news = data.news || [];
    const feedId = await ensurePseudoFeed('currents', 'Currents API');
    let newCount = 0;
    const highScoreArticles = [];
    for (const a of news) {
      const score = await scoreArticleText(`${a.title} ${a.description}`);
      const inserted = await insertArticle(feedId, a.title, a.url, a.description, a.published, score);
      if (inserted) {
        newCount++;
        if (score >= 8) highScoreArticles.push({ title: a.title, score, url: a.url });
      }
    }
    return { newCount, highScoreArticles, fetched: news.length };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

/**
 * Newsdata.io — 200 credits/día free, 12h delay.
 * Docs: https://newsdata.io/documentation
 */
async function fetchNewsdata() {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) {
    return { newCount: 0, highScoreArticles: [], skipped: 'NEWSDATA_API_KEY no configurada' };
  }
  try {
    // 206 países soportados; usamos los del usuario por relevancia
    const url = `https://newsdata.io/api/1/news?apikey=${key}&country=nz,au,es,dz&language=en,es,fr`;
    const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`Newsdata HTTP ${r.status}`);
    const data = await r.json();
    const results = data.results || [];
    const feedId = await ensurePseudoFeed('newsdata', 'Newsdata.io');
    let newCount = 0;
    const highScoreArticles = [];
    for (const a of results) {
      const score = await scoreArticleText(`${a.title} ${a.description}`);
      const inserted = await insertArticle(feedId, a.title, a.link, a.description, a.pubDate, score);
      if (inserted) {
        newCount++;
        if (score >= 8) highScoreArticles.push({ title: a.title, score, url: a.link });
      }
    }
    return { newCount, highScoreArticles, fetched: results.length };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

/**
 * Finlight — 10K req/mes free, foco financiero/geopolítico.
 * Docs: https://finlight.me/docs
 */
async function fetchFinlight() {
  const key = process.env.FINLIGHT_API_KEY;
  if (!key) {
    return { newCount: 0, highScoreArticles: [], skipped: 'FINLIGHT_API_KEY no configurada' };
  }
  try {
    // Finlight API: v2 devuelve 404, v1 es el endpoint actual (verificado 2026-04-08)
    const url = `https://api.finlight.me/v1/articles?language=en&pageSize=50`;
    const r = await fetch(url, {
      headers: { 'X-API-KEY': key, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`Finlight HTTP ${r.status}`);
    const data = await r.json();
    const articles = data.articles || data.data || [];
    const feedId = await ensurePseudoFeed('finlight', 'Finlight (financial)');
    let newCount = 0;
    const highScoreArticles = [];
    for (const a of articles) {
      const score = await scoreArticleText(`${a.title} ${a.summary || a.description}`);
      const inserted = await insertArticle(feedId, a.title, a.link || a.url, a.summary, a.publishDate, score);
      if (inserted) {
        newCount++;
        if (score >= 8) highScoreArticles.push({ title: a.title, score, url: a.link || a.url });
      }
    }
    return { newCount, highScoreArticles, fetched: articles.length };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

/**
 * NewsAPI.ai (Event Registry) — 2K searches/mes free, 150K sources, clusters de eventos
 * Docs: https://eventregistry.org/documentation
 */
async function fetchEventRegistry() {
  const key = process.env.EVENT_REGISTRY_API_KEY;
  if (!key) {
    return { newCount: 0, highScoreArticles: [], skipped: 'EVENT_REGISTRY_API_KEY no configurada' };
  }
  try {
    const url = 'https://eventregistry.org/api/v1/article/getArticles';
    const body = {
      action: 'getArticles',
      apiKey: key,
      lang: ['eng', 'spa', 'fra', 'ara'],
      articlesCount: 50,
      articlesSortBy: 'date',
      resultType: 'articles',
    };
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw new Error(`EventRegistry HTTP ${r.status}`);
    const data = await r.json();
    const articles = data.articles?.results || [];
    const feedId = await ensurePseudoFeed('event_registry', 'NewsAPI.ai (Event Registry)');
    let newCount = 0;
    const highScoreArticles = [];
    for (const a of articles) {
      const score = await scoreArticleText(`${a.title} ${a.body || ''}`);
      const inserted = await insertArticle(feedId, a.title, a.url, (a.body || '').slice(0, 1000), a.dateTime, score);
      if (inserted) {
        newCount++;
        if (score >= 8) highScoreArticles.push({ title: a.title, score, url: a.url });
      }
    }
    return { newCount, highScoreArticles, fetched: articles.length };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

/**
 * YouTube Data API v3 — search videos for keywords (free 10K units/day)
 * Docs: https://developers.google.com/youtube/v3/docs/search/list
 * 1 search = 100 units → 100 searches/day
 */
async function fetchYouTubeSearch() {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    return { newCount: 0, highScoreArticles: [], skipped: 'YOUTUBE_API_KEY no configurada' };
  }
  try {
    const kws = await db.queryAll('SELECT keyword FROM rss_keywords ORDER BY weight DESC LIMIT 3');
    if (!kws.length) return { newCount: 0, highScoreArticles: [] };
    const feedId = await ensurePseudoFeed('youtube_search', 'YouTube Search');
    let newCount = 0;
    const highScoreArticles = [];
    for (const { keyword } of kws) {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=date&maxResults=15&q=${encodeURIComponent(keyword)}&key=${key}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const data = await r.json();
      for (const item of (data.items || [])) {
        const vid = item.id?.videoId;
        if (!vid) continue;
        const title = item.snippet?.title || '';
        const desc = item.snippet?.description || '';
        const ytUrl = `https://www.youtube.com/watch?v=${vid}`;
        const score = await scoreArticleText(`${title} ${desc}`);
        const inserted = await insertArticle(feedId, `[YT] ${title}`, ytUrl, desc.slice(0, 500), item.snippet?.publishedAt, score);
        if (inserted) {
          newCount++;
          if (score >= 8) highScoreArticles.push({ title, score, url: ytUrl });
        }
      }
    }
    return { newCount, highScoreArticles };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

/**
 * Mastodon Search API — search posts across instances (no key needed for public search,
 * but rate-limited; with token gives higher limits + private/direct visibility access)
 * Docs: https://docs.joinmastodon.org/methods/search/
 */
async function fetchMastodonSearch() {
  const instance = process.env.MASTODON_INSTANCE || 'https://mastodon.social';
  const token = process.env.MASTODON_ACCESS_TOKEN;
  try {
    const kws = await db.queryAll('SELECT keyword FROM rss_keywords ORDER BY weight DESC LIMIT 3');
    if (!kws.length) return { newCount: 0, highScoreArticles: [] };
    const feedId = await ensurePseudoFeed('mastodon_search', 'Mastodon Search');
    let newCount = 0;
    const highScoreArticles = [];
    for (const { keyword } of kws) {
      const url = `${instance}/api/v2/search?q=${encodeURIComponent(keyword)}&type=statuses&limit=20`;
      const headers = { Accept: 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) {
          return { newCount: 0, highScoreArticles: [], skipped: 'MASTODON_ACCESS_TOKEN required for search' };
        }
        continue;
      }
      const data = await r.json();
      for (const s of (data.statuses || [])) {
        const text = (s.content || '').replace(/<[^>]*>/g, '').slice(0, 500);
        const sUrl = s.url || s.uri;
        if (!sUrl) continue;
        const score = await scoreArticleText(text);
        const inserted = await insertArticle(feedId, `[Mastodon] ${text.slice(0, 200)}`, sUrl, text, s.created_at, score);
        if (inserted) {
          newCount++;
          if (score >= 8) highScoreArticles.push({ title: text.slice(0, 80), score, url: sUrl });
        }
      }
    }
    return { newCount, highScoreArticles };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

/**
 * Apple Podcasts Search — FREE no auth via iTunes Search API
 * Docs: https://performance-partners.apple.com/search-api
 */
async function fetchApplePodcasts() {
  try {
    const kws = await db.queryAll('SELECT keyword FROM rss_keywords ORDER BY weight DESC LIMIT 3');
    if (!kws.length) return { newCount: 0, highScoreArticles: [] };
    const feedId = await ensurePseudoFeed('apple_podcasts', 'Apple Podcasts Search');
    let newCount = 0;
    const highScoreArticles = [];
    for (const { keyword } of kws) {
      const url = `https://itunes.apple.com/search?media=podcast&entity=podcastEpisode&limit=15&term=${encodeURIComponent(keyword)}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const data = await r.json();
      for (const ep of (data.results || [])) {
        const title = ep.trackName || ep.collectionName || '';
        const epUrl = ep.trackViewUrl || ep.collectionViewUrl;
        if (!epUrl) continue;
        const desc = (ep.description || ep.shortDescription || '').slice(0, 500);
        const score = await scoreArticleText(`${title} ${desc}`);
        const inserted = await insertArticle(feedId, `[Podcast] ${title}`, epUrl, desc, ep.releaseDate, score);
        if (inserted) {
          newCount++;
          if (score >= 8) highScoreArticles.push({ title, score, url: epUrl });
        }
      }
    }
    return { newCount, highScoreArticles };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

/**
 * Podcast Index API — 4M+ podcasts, free with key (unlimited)
 * Docs: https://podcastindex-org.github.io/docs-api/
 */
async function fetchPodcastIndex() {
  const key = process.env.PODCAST_INDEX_KEY;
  const secret = process.env.PODCAST_INDEX_SECRET;
  if (!key || !secret) {
    return { newCount: 0, highScoreArticles: [], skipped: 'PODCAST_INDEX_KEY+SECRET no configurados' };
  }
  try {
    const crypto = require('crypto');
    const apiHeaderTime = Math.floor(Date.now() / 1000);
    const sha1 = crypto.createHash('sha1').update(key + secret + apiHeaderTime).digest('hex');
    const headers = {
      'X-Auth-Date': String(apiHeaderTime),
      'X-Auth-Key': key,
      'Authorization': sha1,
      'User-Agent': 'UltraSystem/1.0',
    };
    const kws = await db.queryAll('SELECT keyword FROM rss_keywords ORDER BY weight DESC LIMIT 3');
    if (!kws.length) return { newCount: 0, highScoreArticles: [] };
    const feedId = await ensurePseudoFeed('podcast_index', 'Podcast Index');
    let newCount = 0;
    const highScoreArticles = [];
    for (const { keyword } of kws) {
      const url = `https://api.podcastindex.org/api/1.0/search/byterm?q=${encodeURIComponent(keyword)}&max=15`;
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const data = await r.json();
      for (const f of (data.feeds || [])) {
        const score = await scoreArticleText(`${f.title} ${f.description || ''}`);
        const inserted = await insertArticle(feedId, `[Podcast] ${f.title}`, f.link || f.url, (f.description || '').slice(0, 500), f.lastUpdateTime ? new Date(f.lastUpdateTime * 1000) : null, score);
        if (inserted) {
          newCount++;
          if (score >= 8) highScoreArticles.push({ title: f.title, score, url: f.link });
        }
      }
    }
    return { newCount, highScoreArticles };
  } catch (err) {
    return { newCount: 0, highScoreArticles: [], error: err.message };
  }
}

module.exports = {
  fetchGdelt,
  fetchBlueskySearch,
  fetchCurrents,
  fetchNewsdata,
  fetchFinlight,
  fetchEventRegistry,
  fetchYouTubeSearch,
  fetchMastodonSearch,
  fetchApplePodcasts,
  fetchPodcastIndex,
};
