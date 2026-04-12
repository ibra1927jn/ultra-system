#!/usr/bin/env node
/**
 * One-shot backfill: populate region (ISO_A2) for existing fires with NULL region.
 * Uses which-polygon + Natural Earth 110m (same as the live ingestion path).
 *
 * Run inside the engine container:
 *   node scripts/backfill_fire_regions.js
 *
 * Or from host via docker exec:
 *   docker exec ultra_engine node scripts/backfill_fire_regions.js
 */
const path = require('path');
const fs = require('fs');
const db = require('../src/db');

const BATCH = 5000;

async function main() {
  const whichPolygon = require('which-polygon');
  const geo = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'data', 'ne_110m_countries.geojson'), 'utf8'));
  const query = whichPolygon(geo);
  console.log('Geocoder loaded (177 countries)');

  const { count } = await db.queryOne(
    `SELECT count(*) FROM wm_satellite_fires WHERE region IS NULL`
  );
  console.log(`Fires to backfill: ${count}`);
  if (count === '0' || count === 0) {
    console.log('Nothing to do.');
    process.exit(0);
  }

  let updated = 0;
  let ocean = 0;
  let lastId = 0;
  let processed = 0;

  while (true) {
    const rows = await db.queryAll(
      `SELECT id, lat, lon FROM wm_satellite_fires
       WHERE region IS NULL AND id > $1 ORDER BY id LIMIT $2`,
      [lastId, BATCH]
    );
    if (rows.length === 0) break;

    for (const r of rows) {
      const result = query([Number(r.lon), Number(r.lat)]);
      const iso = result ? result.ISO_A2 : null;
      if (iso) {
        await db.queryOne(
          `UPDATE wm_satellite_fires SET region = $1 WHERE id = $2`,
          [iso, r.id]
        );
        updated++;
      } else {
        ocean++;
      }
      lastId = r.id;
    }

    processed += rows.length;
    const pct = ((processed / count) * 100).toFixed(1);
    console.log(`  ${processed}/${count} (${pct}%) — ${updated} geocoded, ${ocean} ocean/unmapped`);
  }

  console.log(`Done. ${updated} geocoded, ${ocean} ocean/unmapped out of ${count} total.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
