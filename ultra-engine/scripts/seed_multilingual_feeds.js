// Seed multilingual + Mastodon + YouTube RSS feeds for P1
// All sources are FREE no-auth RSS endpoints.
// Run inside container: docker compose exec ultra_engine node scripts/seed_multilingual_feeds.js

const db = require('../src/db');

const FEEDS = [
  // ─── Multilingual / regional ──────────────────────────────
  // 2026-04-07 dead URL curation: EFE/Lusa/Jeune Afrique/El Watan removed (RSS gone or
  // CF-blocked from datacenter). DW host migrated to rss.dw.com. La Tercera y
  // Khaleej Times ya están en seed country-cl/country-ae con URL canónica.
  { url: 'https://feeds.feedburner.com/EuropaPress', name: 'Europa Press (ES)', category: 'multilingual', tier: 1, lang: 'es', region: 'ES' },
  { url: 'https://www.rfi.fr/fr/afrique/rss', name: 'RFI Afrique', category: 'multilingual', tier: 1, lang: 'fr', region: 'AF' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera English', category: 'multilingual', tier: 1, lang: 'en', region: 'GLOBAL' },
  { url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/2cd5d6dc-fa48-4dff-b5fe-25e60c4eed79', name: 'Al Jazeera Arabic', category: 'multilingual', tier: 1, lang: 'ar', region: 'MENA' },
  { url: 'https://www.lemonde.fr/rss/une.xml', name: 'Le Monde — Une', category: 'multilingual', tier: 1, lang: 'fr', region: 'FR' },
  { url: 'https://www.france24.com/es/rss', name: 'France 24 ES', category: 'multilingual', tier: 1, lang: 'es', region: 'GLOBAL' },
  { url: 'https://rss.dw.com/xml/rss-sp-all', name: 'DW Español', category: 'multilingual', tier: 1, lang: 'es', region: 'GLOBAL' },
  { url: 'https://www.echoroukonline.com/feed', name: 'Echorouk (Algeria AR)', category: 'multilingual', tier: 2, lang: 'ar', region: 'DZ' },
  { url: 'https://www.tsa-algerie.com/feed/', name: 'TSA Algérie', category: 'multilingual', tier: 1, lang: 'fr', region: 'DZ' },

  // ─── Mastodon profile RSS (append .rss to any profile URL) ─
  // Bellingcat / Reuters / BBC Breaking removed: cuentas/instancias muertas (404/410).
  { url: 'https://mastodon.social/@WHO.rss', name: 'WHO (Mastodon)', category: 'mastodon', tier: 1, lang: 'en', source_type: 'social' },
  { url: 'https://mastodon.social/@EU_Commission.rss', name: 'European Commission (Mastodon)', category: 'mastodon', tier: 1, lang: 'en', source_type: 'social' },

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
