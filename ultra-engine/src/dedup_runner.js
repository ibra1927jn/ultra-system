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
  const concatCols = textCols.map(c => `COALESCE(t.${c}::text, '')`).join(" || ' ' || ");
  const dateCol = (table === 'rss_articles' ? 'created_at' :
                   table === 'opportunities' ? 'created_at' :
                   table === 'job_listings' ? 'scraped_at' : 'created_at');

  // For rss_articles, JOIN with rss_feeds to get lang for same-language guard.
  // Cross-language MinHash produces false positives (short titles in different
  // scripts collide). Only mark as duplicate if languages match.
  const hasLang = (table === 'rss_articles');
  const langSelect = hasLang ? `, COALESCE(f.lang, 'xx') AS lang` : '';
  const langJoin = hasLang ? `LEFT JOIN rss_feeds f ON f.id = t.feed_id` : '';

  const rows = await db.queryAll(
    `SELECT t.${idCol} AS id, (${concatCols}) AS text${langSelect}
     FROM ${table} t
     ${langJoin}
     WHERE t.duplicate_of IS NULL
       AND t.${dateCol} >= NOW() - INTERVAL '${parseInt(lookbackDays, 10)} days'
     ORDER BY t.${idCol} ASC`
  );

  if (rows.length < 2) {
    return { table, scanned: rows.length, duplicates: 0, marked: 0, langFiltered: 0 };
  }

  const lsh = new MinHashLSH({ numHashes: DEFAULTS.numHashes, bands: DEFAULTS.bands, rows: DEFAULTS.rows });
  const langMap = new Map(); // docId → lang (for same-language guard)
  const dups = [];
  let langFiltered = 0;

  let tooShort = 0;
  for (const row of rows) {
    const shingles = MinHash.shingle(row.text);
    if (shingles.size < MinHash.MIN_SHINGLES) {
      // Too few shingles for reliable MinHash — skip dedup, insert as unique
      tooShort++;
      continue;
    }
    const m = new MinHash(DEFAULTS.numHashes);
    m.updateBatch(shingles);
    const matches = lsh.queryWithThreshold(m, threshold);

    let matched = false;
    if (matches.length > 0 && hasLang) {
      // Same-language guard: only accept match if languages are compatible
      for (const match of matches) {
        const canonLang = langMap.get(match.docId);
        if (canonLang === row.lang || canonLang === 'xx' || row.lang === 'xx') {
          dups.push({ id: row.id, duplicate_of: match.docId, similarity: match.similarity });
          matched = true;
          break;
        }
      }
      if (!matched) langFiltered++;
    } else if (matches.length > 0) {
      // Non-rss_articles tables: no lang guard needed
      const canonical = matches[0].docId;
      dups.push({ id: row.id, duplicate_of: canonical, similarity: matches[0].similarity });
      matched = true;
    }

    if (!matched) {
      lsh.insert(row.id, m);
      if (hasLang) langMap.set(row.id, row.lang);
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

  return { table, scanned: rows.length, duplicates: dups.length, marked, threshold, langFiltered, tooShort };
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
