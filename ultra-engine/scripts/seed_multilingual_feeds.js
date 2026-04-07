// Seed multilingual + Mastodon + YouTube RSS feeds for P1
// All sources are FREE no-auth RSS endpoints.
// Run inside container: docker compose exec ultra_engine node scripts/seed_multilingual_feeds.js

const db = require('../src/db');

const FEEDS = [
  // ─── Multilingual / regional ──────────────────────────────
  { url: 'https://www.efe.com/efe/espana/1/rss', name: 'Agencia EFE — España', category: 'multilingual', tier: 1, lang: 'es', region: 'ES' },
  { url: 'https://www.jeuneafrique.com/feed/', name: 'Jeune Afrique', category: 'multilingual', tier: 2, lang: 'fr', region: 'AF' },
  { url: 'https://www.rfi.fr/fr/afrique/rss', name: 'RFI Afrique', category: 'multilingual', tier: 1, lang: 'fr', region: 'AF' },
  { url: 'https://www.lusa.pt/rss', name: 'Agência Lusa', category: 'multilingual', tier: 1, lang: 'pt', region: 'PT' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera English', category: 'multilingual', tier: 1, lang: 'en', region: 'GLOBAL' },
  { url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/2cd5d6dc-fa48-4dff-b5fe-25e60c4eed79', name: 'Al Jazeera Arabic', category: 'multilingual', tier: 1, lang: 'ar', region: 'MENA' },
  { url: 'https://www.lemonde.fr/rss/une.xml', name: 'Le Monde — Une', category: 'multilingual', tier: 1, lang: 'fr', region: 'FR' },
  { url: 'https://www.latercera.com/feed/', name: 'La Tercera (Chile)', category: 'multilingual', tier: 2, lang: 'es', region: 'LATAM' },
  { url: 'https://www.khaleejtimes.com/rss', name: 'Khaleej Times (UAE)', category: 'multilingual', tier: 2, lang: 'en', region: 'GULF' },
  { url: 'https://www.france24.com/es/rss', name: 'France 24 ES', category: 'multilingual', tier: 1, lang: 'es', region: 'GLOBAL' },
  { url: 'https://www.dw.com/atom/rss-es-es', name: 'DW Español', category: 'multilingual', tier: 1, lang: 'es', region: 'GLOBAL' },
  { url: 'https://www.echoroukonline.com/feed', name: 'Echorouk (Algeria AR)', category: 'multilingual', tier: 2, lang: 'ar', region: 'DZ' },
  { url: 'https://www.elwatan-dz.com/feed', name: 'El Watan (Algeria FR)', category: 'multilingual', tier: 2, lang: 'fr', region: 'DZ' },
  { url: 'https://www.tsa-algerie.com/feed/', name: 'TSA Algérie', category: 'multilingual', tier: 1, lang: 'fr', region: 'DZ' },

  // ─── Mastodon profile RSS (append .rss to any profile URL) ─
  { url: 'https://mastodon.social/@WHO.rss', name: 'WHO (Mastodon)', category: 'mastodon', tier: 1, lang: 'en', source_type: 'social' },
  { url: 'https://mastodon.social/@EU_Commission.rss', name: 'European Commission (Mastodon)', category: 'mastodon', tier: 1, lang: 'en', source_type: 'social' },
  { url: 'https://mastodon.world/@bellingcat.rss', name: 'Bellingcat (Mastodon)', category: 'mastodon', tier: 1, lang: 'en', source_type: 'social' },
  { url: 'https://newsie.social/@reuters.rss', name: 'Reuters (Mastodon)', category: 'mastodon', tier: 1, lang: 'en', source_type: 'social' },
  { url: 'https://mstdn.social/@BBCBreakingNews.rss', name: 'BBC Breaking (Mastodon)', category: 'mastodon', tier: 1, lang: 'en', source_type: 'social' },

  // ─── YouTube channel RSS (no key, just channel_id) ────────
  // Format: https://www.youtube.com/feeds/videos.xml?channel_id=XXX
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC16niRr50-MSBwiO3YDb3RA', name: 'BBC News (YouTube)', category: 'youtube', tier: 1, lang: 'en', source_type: 'video' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCNye-wNBqNL5ZzHSJj3l8Bg', name: 'Al Jazeera English (YouTube)', category: 'youtube', tier: 1, lang: 'en', source_type: 'video' },
  { url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCknLrEdhRCp1aegoMqRaCZg', name: 'DW News (YouTube)', category: 'youtube', tier: 1, lang: 'en', source_type: 'video' },
];

(async () => {
  let inserted = 0;
  for (const f of FEEDS) {
    try {
      const r = await db.queryOne(
        `INSERT INTO rss_feeds (url, name, category, tier, lang, region, source_type, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
         ON CONFLICT (url) DO NOTHING RETURNING id`,
        [f.url, f.name, f.category, f.tier || null, f.lang || null,
         f.region || null, f.source_type || 'rss']
      );
      if (r) inserted++;
    } catch (err) {
      console.error(`✗ ${f.name}: ${err.message}`);
    }
  }
  console.log(`✓ Multilingual seed: ${inserted}/${FEEDS.length} new feeds inserted`);
  process.exit(0);
})();
