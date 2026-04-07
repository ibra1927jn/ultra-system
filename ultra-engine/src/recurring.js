// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Recurring expense detection (P3 Fase 2)  ║
// ║                                                            ║
// ║  Algoritmo:                                                ║
// ║  1. Group finances expenses by normalized payee           ║
// ║     (lowercase + strip puntuación + colapsa whitespace)    ║
// ║  2. Para cada grupo: si N >= 3, computar intervals entre  ║
// ║     fechas consecutivas y promedio amount.                ║
// ║  3. Inferir frequency: <10d→weekly, 10-20→biweekly,       ║
// ║     20-45→monthly, 45-100→bimonthly, 100-200→quarterly,   ║
// ║     >200→yearly. confidence = 1 - stddev/mean (intervals).║
// ║  4. Upsert a fin_recurring (UNIQUE payee_normalized+freq).║
// ║  5. next_expected = last_seen + avg_interval_days.         ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

function normalizePayee(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\d{4,}/g, '')   // strip card numbers, refs largos
    .trim()
    .slice(0, 200);
}

function inferFrequency(avgDays) {
  if (avgDays < 10) return 'weekly';
  if (avgDays < 20) return 'biweekly';
  if (avgDays < 45) return 'monthly';
  if (avgDays < 100) return 'bimonthly';
  if (avgDays < 200) return 'quarterly';
  return 'yearly';
}

function computeStats(dates, amounts) {
  // dates: array de Date sorted ascending
  // amounts: array números mismas longitudes
  const intervals = [];
  for (let i = 1; i < dates.length; i++) {
    const d = (dates[i] - dates[i - 1]) / 86400000;
    intervals.push(d);
  }
  if (intervals.length === 0) return null;
  const meanInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((a, b) => a + (b - meanInterval) ** 2, 0) / intervals.length;
  const stddev = Math.sqrt(variance);
  const cv = meanInterval > 0 ? stddev / meanInterval : 1; // coefficient of variation
  const meanAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  return {
    avg_interval_days: Number(meanInterval.toFixed(2)),
    confidence: Number(Math.max(0, Math.min(1, 1 - cv)).toFixed(2)),
    amount_avg: Number(meanAmount.toFixed(2)),
    sample_size: dates.length,
    last_seen: dates[dates.length - 1],
  };
}

/**
 * Detecta gastos recurrentes en finances. Solo type='expense'.
 * lookbackDays: ventana hacia atrás (default 365).
 * minSamples: mínimos hits para considerar (default 3).
 */
async function detectRecurring({ lookbackDays = 365, minSamples = 3 } = {}) {
  const rows = await db.queryAll(
    `SELECT id, date, amount, currency, description, category
     FROM finances
     WHERE type='expense'
       AND date >= CURRENT_DATE - INTERVAL '${parseInt(lookbackDays, 10)} days'
       AND description IS NOT NULL
     ORDER BY date ASC`
  );

  // Bucket by normalized payee
  const groups = new Map();
  for (const r of rows) {
    const key = normalizePayee(r.description);
    if (!key || key.length < 3) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const detected = [];

  for (const [payee, items] of groups.entries()) {
    if (items.length < minSamples) continue;
    const dates = items.map(i => new Date(i.date));
    const amounts = items.map(i => Math.abs(parseFloat(i.amount)));
    const stats = computeStats(dates, amounts);
    if (!stats) continue;

    // Solo aceptar como recurrente si confidence >= 0.5
    if (stats.confidence < 0.5) continue;

    const frequency = inferFrequency(stats.avg_interval_days);
    const nextExpected = new Date(stats.last_seen.getTime() + stats.avg_interval_days * 86400000);

    detected.push({
      payee_normalized: payee,
      frequency,
      amount_avg: stats.amount_avg,
      currency: items[0].currency || 'NZD',
      next_expected: nextExpected.toISOString().split('T')[0],
      last_seen: stats.last_seen.toISOString().split('T')[0],
      avg_interval_days: stats.avg_interval_days,
      confidence: stats.confidence,
      sample_size: stats.sample_size,
    });
  }

  // Upsert
  let inserted = 0;
  let updated = 0;
  for (const d of detected) {
    const existing = await db.queryOne(
      `SELECT id FROM fin_recurring WHERE payee_normalized=$1 AND frequency=$2`,
      [d.payee_normalized, d.frequency]
    );
    if (existing) {
      await db.query(
        `UPDATE fin_recurring SET
           amount_avg=$1, currency=$2, next_expected=$3, last_seen=$4,
           confidence=$5, sample_size=$6, avg_interval_days=$7
         WHERE id=$8`,
        [d.amount_avg, d.currency, d.next_expected, d.last_seen,
         d.confidence, d.sample_size, d.avg_interval_days, existing.id]
      );
      updated++;
    } else {
      await db.query(
        `INSERT INTO fin_recurring
         (payee_normalized, frequency, amount_avg, currency, next_expected, last_seen,
          confidence, sample_size, avg_interval_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [d.payee_normalized, d.frequency, d.amount_avg, d.currency,
         d.next_expected, d.last_seen, d.confidence, d.sample_size, d.avg_interval_days]
      );
      inserted++;
    }
  }

  return {
    ok: true,
    scanned_rows: rows.length,
    detected: detected.length,
    inserted,
    updated,
    items: detected,
  };
}

module.exports = {
  normalizePayee,
  inferFrequency,
  computeStats,
  detectRecurring,
};
