#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════╗
// ║  Tier S #4 — passport-index-dataset full import          ║
// ║                                                            ║
// ║  Source: ilyankou/passport-index-dataset (CC BY-SA 4.0)   ║
// ║  Format: CSV matrix 199×199 = ~40K cells                  ║
// ║                                                            ║
// ║  Cell values:                                              ║
// ║   - "visa free"                                            ║
// ║   - "visa on arrival"                                      ║
// ║   - "e-visa"                                               ║
// ║   - "eta"                                                  ║
// ║   - "visa required"                                        ║
// ║   - {N} (number → días sin visa, ej "90", "180")          ║
// ║   - "-1" (self, mismo país)                                ║
// ║   - "covid ban"                                            ║
// ║                                                            ║
// ║  Insertamos a bur_visa_matrix con UPSERT (no destruimos    ║
// ║  los 188 manuales con notas extras).                       ║
// ╚══════════════════════════════════════════════════════════╝

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const db = require('../ultra-engine/src/db');

const CSV_URL = 'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-matrix-iso2.csv';

// Mapping cell value → { requirement, days_allowed }
function parseCell(cell) {
  const v = (cell || '').trim();
  if (v === '' || v === '-1') return null;  // self or empty
  if (v === 'visa free') return { requirement: 'visa free', days_allowed: null };
  if (v === 'visa on arrival') return { requirement: 'visa on arrival', days_allowed: null };
  if (v === 'e-visa') return { requirement: 'e-visa', days_allowed: null };
  if (v === 'eta') return { requirement: 'eta', days_allowed: null };
  if (v === 'visa required') return { requirement: 'visa required', days_allowed: null };
  if (v === 'covid ban' || v === 'no admission') return { requirement: 'no admission', days_allowed: null };
  // Numeric: días visa-free
  const n = parseInt(v, 10);
  if (!isNaN(n) && n > 0 && n <= 730) {
    return { requirement: 'visa free', days_allowed: n };
  }
  // Skip values we don't recognize
  return null;
}

async function main() {
  console.log('📥 Downloading passport-index-dataset...');
  const r = await fetch(CSV_URL);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  const lines = text.split('\n').filter(l => l.trim());
  console.log(`✅ ${lines.length} lines downloaded (${(text.length / 1024).toFixed(0)}KB)`);

  // Header: "Passport,AL,DZ,AD,..."
  const headerCols = lines[0].split(',').map(s => s.trim());
  const destinations = headerCols.slice(1);  // skip "Passport" column
  console.log(`📋 ${destinations.length} destinations parsed from header`);

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  // Use a single transaction for speed
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(s => s.trim());
      const passport = cols[0];
      if (!passport || passport.length !== 2) continue;

      for (let j = 0; j < destinations.length; j++) {
        const dest = destinations[j];
        if (!dest || dest.length !== 2 || dest === passport) continue;
        const cell = cols[j + 1];
        const parsed = parseCell(cell);
        if (!parsed) { skipped++; continue; }

        try {
          const result = await client.query(
            `INSERT INTO bur_visa_matrix (passport, destination, requirement, days_allowed, notes, updated_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT (passport, destination) DO UPDATE SET
               requirement = EXCLUDED.requirement,
               days_allowed = COALESCE(EXCLUDED.days_allowed, bur_visa_matrix.days_allowed),
               notes = COALESCE(bur_visa_matrix.notes, EXCLUDED.notes),
               updated_at = NOW()
             RETURNING (xmax = 0) AS inserted`,
            [
              passport,
              dest,
              parsed.requirement,
              parsed.days_allowed,
              'imported from passport-index-dataset (ilyankou, CC BY-SA 4.0)',
            ]
          );
          if (result.rows[0]?.inserted) inserted++;
          else updated++;
          processed++;
        } catch (err) {
          errors++;
          if (errors < 5) console.warn(`⚠️ ${passport}→${dest}: ${err.message}`);
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log('');
  console.log('═══ IMPORT SUMMARY ═══');
  console.log(`Processed:  ${processed}`);
  console.log(`Inserted:   ${inserted}`);
  console.log(`Updated:    ${updated}`);
  console.log(`Skipped:    ${skipped}`);
  console.log(`Errors:     ${errors}`);

  // Final stats
  const stats = await db.queryAll(`
    SELECT passport, COUNT(*) AS dests FROM bur_visa_matrix GROUP BY passport ORDER BY 2 DESC LIMIT 15
  `);
  console.log('');
  console.log('═══ TOP 15 PASSPORTS BY DESTINATION COUNT ═══');
  for (const s of stats) console.log(`  ${s.passport}: ${s.dests}`);

  const total = await db.queryOne('SELECT COUNT(*) AS total FROM bur_visa_matrix');
  console.log('');
  console.log(`✅ Total bur_visa_matrix rows: ${total.total}`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
