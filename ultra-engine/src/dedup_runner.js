// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Dedup runner cross-table (P1 Fase 2)     ║
// ║                                                            ║
// ║  Aplica MinHash+LSH a:                                     ║
// ║   - rss_articles  (title + summary)                        ║
// ║   - opportunities (title + description)                    ║
// ║   - job_listings  (title + company + description)          ║
// ║                                                            ║
// ║  Solo procesa rows con duplicate_of IS NULL (idempotente). ║
// ║  Marca duplicates, mantiene el primero como "canonical".  ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const { MinHash, MinHashLSH } = require('./minhash');

// bands=32 rows=4 → LSH natural threshold ~0.42 (alta recall).
// post-filter Jaccard real al threshold del usuario (default 0.7).
const DEFAULTS = {
  numHashes: 128,
  bands: 32,
  rows: 4,
  threshold: 0.7,
};

async function dedupTable({ table, idCol = 'id', textCols, lookbackDays = 30, threshold = DEFAULTS.threshold } = {}) {
  if (!table || !textCols || !textCols.length) {
    throw new Error('table y textCols obligatorios');
  }
  const concatCols = textCols.map(c => `COALESCE(${c}::text, '')`).join(" || ' ' || ");
  const dateCol = (table === 'rss_articles' ? 'created_at' :
                   table === 'opportunities' ? 'created_at' :
                   table === 'job_listings' ? 'scraped_at' : 'created_at');

  const rows = await db.queryAll(
    `SELECT ${idCol} AS id, (${concatCols}) AS text
     FROM ${table}
     WHERE duplicate_of IS NULL
       AND ${dateCol} >= NOW() - INTERVAL '${parseInt(lookbackDays, 10)} days'
     ORDER BY ${idCol} ASC`
  );

  if (rows.length < 2) {
    return { table, scanned: rows.length, duplicates: 0, marked: 0 };
  }

  const lsh = new MinHashLSH({ numHashes: DEFAULTS.numHashes, bands: DEFAULTS.bands, rows: DEFAULTS.rows });
  const dups = [];

  for (const row of rows) {
    const m = new MinHash(DEFAULTS.numHashes);
    m.updateBatch(MinHash.shingle(row.text));
    const matches = lsh.queryWithThreshold(m, threshold);
    if (matches.length > 0) {
      // Marcar como duplicado del primer match (por ID más bajo = canonical)
      const canonical = matches[0].docId;
      dups.push({ id: row.id, duplicate_of: canonical, similarity: matches[0].similarity });
    } else {
      lsh.insert(row.id, m);
    }
  }

  // Aplicar UPDATEs en batch (transacción)
  let marked = 0;
  if (dups.length > 0) {
    for (const d of dups) {
      await db.query(
        `UPDATE ${table} SET duplicate_of = $1, dedup_similarity = $2 WHERE ${idCol} = $3`,
        [d.duplicate_of, d.similarity, d.id]
      );
      marked++;
    }
  }

  return { table, scanned: rows.length, duplicates: dups.length, marked, threshold };
}

async function runAll({ lookbackDays = 30, threshold = 0.7 } = {}) {
  const results = {};
  results.rss = await dedupTable({
    table: 'rss_articles',
    textCols: ['title', 'summary'],
    lookbackDays, threshold,
  });
  results.opportunities = await dedupTable({
    table: 'opportunities',
    textCols: ['title', 'description'],
    lookbackDays, threshold,
  });
  results.job_listings = await dedupTable({
    table: 'job_listings',
    textCols: ['title', 'company', 'description'],
    lookbackDays, threshold,
  });
  return results;
}

module.exports = { dedupTable, runAll, DEFAULTS };
