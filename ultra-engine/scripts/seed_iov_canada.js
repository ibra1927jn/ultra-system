// ════════════════════════════════════════════════════════════
//  seed_iov_canada.js — bulk import iOverlander Canada POIs
//
//  Source: cug/wp_converter (MIT, Copyright 2024 Guido Neitzer)
//          sample_data/canada_24_07.csv (4.4MB, ~9K rows)
//          The author downloaded it via his iOverlander Unlimited
//          subscription and committed it as test data for his GPX
//          converter project. Format = official iOverlander 37-col CSV.
//
//  Why this file: iOverlander's official endpoint /export/places is
//  paywalled (Unlimited subscription). The cug/wp_converter dump is the
//  only clean, recent (2024-07), MIT-licensed iOverlander export on
//  public GitHub — verified via search of distinctive header columns.
//
//  Run once: docker compose exec -T engine node scripts/seed_iov_canada.js
//
//  Idempotent: ON CONFLICT (source, source_id) DO UPDATE — re-run safe.
// ════════════════════════════════════════════════════════════

const { importIOverlanderCSV } = require('../src/logistics_extras');

const URL = 'https://raw.githubusercontent.com/cug/wp_converter/main/sample_data/canada_24_07.csv';

(async () => {
  console.log(`[seed-iov-ca] downloading ${URL}`);
  const r = await fetch(URL, {
    headers: { 'User-Agent': 'UltraSystem/1.0 (personal use; van-life destination intelligence)' },
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) {
    console.error(`download failed: HTTP ${r.status}`);
    process.exit(1);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  console.log(`[seed-iov-ca] downloaded ${(buf.length / 1024 / 1024).toFixed(2)} MB`);

  const result = await importIOverlanderCSV(buf, { country: 'CA' });
  console.log('[seed-iov-ca] result:', JSON.stringify(result, null, 2));
  process.exit(0);
})().catch(e => {
  console.error('FATAL', e);
  process.exit(1);
});
