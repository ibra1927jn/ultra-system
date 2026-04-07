// ╔══════════════════════════════════════════════════════════╗
// ║  Seed LatAm RSS feeds from Adam Isacson's blogroll        ║
// ║                                                            ║
// ║  Adam Isacson (WOLA) curates ~87+ LatAm-focused sources   ║
// ║  at https://adamisacson.com/blogroll/. Este script:        ║
// ║   1. Scrape el blogroll vía Puppeteer sidecar              ║
// ║   2. Para cada link externo, descubre el feed RSS (probe   ║
// ║      paths comunes + parse <link rel="alternate">)         ║
// ║   3. Valida que el feed parsea (rss-parser)                ║
// ║   4. Insert en rss_feeds con category='latam', region...   ║
// ║                                                            ║
// ║  Usage:                                                    ║
// ║    docker compose exec engine node /app/scripts/seed_isacson_latam.js
// ╚══════════════════════════════════════════════════════════╝

const db = require('../src/db');
const pup = require('../src/puppeteer');
const Parser = require('rss-parser');

const BLOGROLL_URL = 'https://adamisacson.com/blogroll/';
const FEED_CANDIDATES = ['/feed/', '/feed', '/rss/', '/rss', '/rss.xml', '/atom.xml', '/index.xml', '/feed.xml'];
const HTTP_TIMEOUT = 12000;
const parser = new Parser({ timeout: HTTP_TIMEOUT });

function cleanHost(url) {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch { return null; }
}

function pathJoin(base, path) {
  return base.replace(/\/$/, '') + path;
}

async function tryFeedCandidate(url) {
  try {
    const feed = await parser.parseURL(url);
    if (feed && (feed.items?.length || 0) > 0) {
      return { url, title: feed.title || null, items: feed.items.length };
    }
    return null;
  } catch {
    return null;
  }
}

async function discoverFromHtml(baseUrl) {
  try {
    const r = await fetch(baseUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; UltraSystem/1.0)' },
      signal: AbortSignal.timeout(HTTP_TIMEOUT),
    });
    if (!r.ok) return null;
    const html = await r.text();
    // <link rel="alternate" type="application/rss+xml" href="...">
    const m = html.match(/<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i)
      || html.match(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i);
    if (!m) return null;
    let feedUrl = m[2];
    if (feedUrl.startsWith('/')) feedUrl = cleanHost(baseUrl) + feedUrl;
    else if (!feedUrl.startsWith('http')) feedUrl = pathJoin(baseUrl, '/' + feedUrl);
    return feedUrl;
  } catch {
    return null;
  }
}

async function discoverFeed(siteUrl) {
  const host = cleanHost(siteUrl);
  if (!host) return null;

  // 1. Try common feed paths against host root
  for (const path of FEED_CANDIDATES) {
    const res = await tryFeedCandidate(host + path);
    if (res) return res;
  }

  // 2. Try against the exact siteUrl (for tag/category pages)
  const siteNoTrail = siteUrl.replace(/\/$/, '');
  for (const path of FEED_CANDIDATES) {
    if (siteNoTrail === host) break; // already tried
    const res = await tryFeedCandidate(siteNoTrail + path);
    if (res) return res;
  }

  // 3. Fallback: parse HTML <link rel="alternate">
  const discovered = await discoverFromHtml(siteUrl);
  if (discovered) {
    const res = await tryFeedCandidate(discovered);
    if (res) return res;
  }

  return null;
}

async function main() {
  if (!(await pup.isAvailable())) {
    console.error('❌ Puppeteer sidecar offline');
    process.exit(1);
  }

  console.log('📥 Fetching blogroll...');
  const r = await pup.scrape({
    url: BLOGROLL_URL,
    waitFor: 4000,
    extract: 'links',
  });
  if (!r.ok) { console.error('❌ scrape failed:', r.error); process.exit(1); }

  const links = r.data || [];
  // External links only, filter noise
  const NOISE = /adamisacson\.com|twitter\.com|x\.com|facebook\.com|linkedin\.com|youtube\.com\/watch|youtu\.be|instagram\.com|mastodon\.social|bsky\.app|wikipedia\.org|wikidata\.org|doi\.org|github\.com|wordpress\.org|jetpack\.com|gravatar/i;
  const external = links.filter(l => {
    const h = l.href || '';
    return h.startsWith('http') && !NOISE.test(h);
  });

  // Dedupe by host
  const byHost = new Map();
  for (const l of external) {
    const host = cleanHost(l.href);
    if (!host) continue;
    if (!byHost.has(host)) byHost.set(host, { host, title: (l.text || '').trim().slice(0, 100) || host, urls: new Set() });
    byHost.get(host).urls.add(l.href);
  }

  const sites = [...byHost.values()];
  console.log(`📋 ${links.length} total links, ${external.length} external, ${sites.length} unique hosts`);

  let discovered = 0, failed = 0, inserted = 0, dupes = 0;
  for (const site of sites) {
    const feed = await discoverFeed(site.host);
    if (!feed) {
      failed++;
      console.log(`  ❌ ${site.host}`);
      continue;
    }
    discovered++;
    // Insert or upsert
    try {
      const existing = await db.queryOne('SELECT id FROM rss_feeds WHERE url = $1', [feed.url]);
      if (existing) { dupes++; console.log(`  ⧗ dupe ${feed.url}`); continue; }
      await db.query(
        `INSERT INTO rss_feeds (url, name, category, region, source_type, tier, is_active)
         VALUES ($1, $2, 'latam', 'latin_america', 'isacson_blogroll', 2, TRUE)`,
        [feed.url, (feed.title || site.title).slice(0, 200)]
      );
      inserted++;
      console.log(`  ✅ ${feed.url} (${feed.items} items)`);
    } catch (err) {
      console.log(`  ⚠️ insert err ${feed.url}: ${err.message}`);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`  sites_scanned: ${sites.length}`);
  console.log(`  feeds_discovered: ${discovered}`);
  console.log(`  feeds_failed: ${failed}`);
  console.log(`  inserted: ${inserted}`);
  console.log(`  dupes: ${dupes}`);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('FATAL:', err); process.exit(1); });
