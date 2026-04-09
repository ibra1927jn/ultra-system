// ════════════════════════════════════════════════════════════
//  WM Phase 3 Bloque 5 — Correlation runner (Phase 2 closure)
//
//  Server-side correlation detector that runs entirely off PG state.
//  Reads recent rows from:
//    - wm_market_quotes      (price moves)
//    - wm_crypto_quotes      (24h crypto moves)
//    - wm_fx_rates           (DoD FX moves)
//    - wm_prediction_markets + wm_prediction_market_snapshots (prob shifts)
//    - wm_cyber_cves         (new CRITICAL or KEV CVEs)
//    - wm_internet_outages   (newly opened govt-directed outages)
//
//  Emits CorrelationSignal rows into wm_correlation_signals.
//
//  This is intentionally NOT a port of analysis-core.analyzeCorrelationsCore.
//  That algorithm operates on the in-memory ClusteredEvent[] +
//  PredictionMarket[] + MarketData[] shapes from the desktop pipeline,
//  with statefulness around previousSnapshot. Mapping PG rows back into
//  those shapes adds a lot of glue and timing fragility for little
//  benefit. The detectors below are deliberately simple and mechanical:
//  thresholds + entity-key dedup against the last 24h of fired signals.
//
//  Each detector is independent and idempotent. Re-running the cron
//  emits a NEW signal only if (a) the threshold is crossed AND
//  (b) we haven't fired the same (signal_type, entity_key) in the
//  dedup window.
//
//  Used by ultra-engine/src/wm_bridge.js → runCorrelationJob.
// ════════════════════════════════════════════════════════════

// Re-export from this file is awkward because wm_bridge.js consumes
// these via require() (lazy via tsx). The detectors take a `db` arg
// (the pg pool wrapper) so we don't have to import the JS db module
// from inside this TS file — keeps the dependency direction clean.

export interface DbLike {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  queryAll(sql: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  queryOne(sql: string, params?: unknown[]): Promise<Record<string, unknown> | null>;
}

export interface CorrelationSignalRow {
  signalType: string;
  entityKey: string;
  title: string;
  description: string | null;
  confidence: number;       // 0..1
  magnitude: number | null; // |Δ| of underlying move
  baseline: number | null;
  observed: number | null;
  related: unknown;
  raw: unknown;
}

// ─── Threshold knobs ──────────────────────────────────────────────
const MARKET_MOVE_PCT = 3.0;          // |change_pct| ≥ 3% on stocks/sectors/indices
const CRYPTO_MOVE_PCT = 5.0;          // |change_24h_pct| ≥ 5% on top4 crypto
const FX_MOVE_PCT = 1.0;              // |change_pct| ≥ 1% on FX
const PREDICTION_SWING_PP = 0.05;     // |Δprobability| ≥ 5pp in last ~60min
const CVE_MIN_CRITICAL = 9.0;         // CVSS ≥ 9.0 = "critical" detector

// Dedup windows (in hours) per signal type — within this window, we
// won't fire a duplicate signal for the same entity_key.
const DEDUP_HOURS: Record<string, number> = {
  market_move: 6,
  crypto_move: 6,
  fx_move: 12,
  prediction_swing: 6,
  cve_critical: 168,             // a CVE only needs to fire once a week
  outage_started: 24,
};

async function isRecentDuplicate(db: DbLike, signalType: string, entityKey: string): Promise<boolean> {
  const hours = DEDUP_HOURS[signalType] ?? 6;
  const r = await db.queryOne(
    `SELECT 1
       FROM wm_correlation_signals
      WHERE signal_type = $1 AND entity_key = $2
        AND fired_at > NOW() - ($3::int * INTERVAL '1 hour')
      LIMIT 1`,
    [signalType, entityKey, hours]
  );
  return !!r;
}

async function persistSignal(db: DbLike, sig: CorrelationSignalRow): Promise<boolean> {
  const r = await db.queryOne(
    `INSERT INTO wm_correlation_signals
       (signal_type, entity_key, title, description, confidence,
        magnitude, baseline, observed, related, raw, fired_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW())
     RETURNING id`,
    [
      sig.signalType,
      sig.entityKey,
      sig.title,
      sig.description,
      sig.confidence,
      sig.magnitude,
      sig.baseline,
      sig.observed,
      sig.related ? JSON.stringify(sig.related) : null,
      sig.raw ? JSON.stringify(sig.raw) : null,
    ]
  );
  return !!(r && r.id);
}

// ─── Detector: market_move ────────────────────────────────────────
//
// For each unique symbol with at least one snapshot in the last 30
// minutes, take the most recent snapshot and check |change_pct| ≥
// MARKET_MOVE_PCT. The change_pct column is precomputed by
// market-quotes.ts vs the previous_close, so this is purely a
// threshold check.
async function detectMarketMoves(db: DbLike): Promise<CorrelationSignalRow[]> {
  const rows = await db.queryAll(
    `SELECT DISTINCT ON (symbol)
            symbol, display, name, category, price, previous_close,
            change_abs, change_pct, observed_at
       FROM wm_market_quotes
      WHERE observed_at > NOW() - INTERVAL '30 minutes'
        AND change_pct IS NOT NULL
        AND ABS(change_pct) >= $1
      ORDER BY symbol, observed_at DESC`,
    [MARKET_MOVE_PCT]
  );

  const out: CorrelationSignalRow[] = [];
  for (const r of rows) {
    const symbol = String(r.symbol);
    const change = Number(r.change_pct);
    const dir = change >= 0 ? 'up' : 'down';
    out.push({
      signalType: 'market_move',
      entityKey: `symbol:${symbol}`,
      title: `${(r.display || symbol)} ${dir} ${change.toFixed(2)}%`,
      description: `${r.name || symbol} (${r.category}) moved ${change.toFixed(2)}% — close ${r.previous_close} → ${r.price}`,
      confidence: Math.min(1, 0.6 + Math.abs(change) / 20),
      magnitude: Math.abs(change),
      baseline: r.previous_close ? Number(r.previous_close) : null,
      observed: r.price ? Number(r.price) : null,
      related: { category: r.category, observedAt: r.observed_at },
      raw: { symbol, change_pct: change },
    });
  }
  return out;
}

// ─── Detector: crypto_move ────────────────────────────────────────
async function detectCryptoMoves(db: DbLike): Promise<CorrelationSignalRow[]> {
  const rows = await db.queryAll(
    `SELECT DISTINCT ON (coin_id)
            coin_id, symbol, name, price_usd, change_24h_pct, observed_at
       FROM wm_crypto_quotes
      WHERE observed_at > NOW() - INTERVAL '15 minutes'
        AND change_24h_pct IS NOT NULL
        AND ABS(change_24h_pct) >= $1
      ORDER BY coin_id, observed_at DESC`,
    [CRYPTO_MOVE_PCT]
  );
  const out: CorrelationSignalRow[] = [];
  for (const r of rows) {
    const coinId = String(r.coin_id);
    const change = Number(r.change_24h_pct);
    const dir = change >= 0 ? 'up' : 'down';
    out.push({
      signalType: 'crypto_move',
      entityKey: `crypto:${coinId}`,
      title: `${r.symbol || coinId} ${dir} ${change.toFixed(2)}% (24h)`,
      description: `${r.name || coinId} 24h change ${change.toFixed(2)}% at $${r.price_usd}`,
      confidence: Math.min(1, 0.6 + Math.abs(change) / 30),
      magnitude: Math.abs(change),
      baseline: null,
      observed: r.price_usd ? Number(r.price_usd) : null,
      related: { observedAt: r.observed_at },
      raw: { coin_id: coinId, change_24h_pct: change },
    });
  }
  return out;
}

// ─── Detector: fx_move ────────────────────────────────────────────
async function detectFxMoves(db: DbLike): Promise<CorrelationSignalRow[]> {
  const rows = await db.queryAll(
    `SELECT base, quote, rate, prev_rate, change_pct, rate_date
       FROM wm_fx_rates
      WHERE rate_date >= CURRENT_DATE - INTERVAL '2 days'
        AND change_pct IS NOT NULL
        AND ABS(change_pct) >= $1
      ORDER BY rate_date DESC`,
    [FX_MOVE_PCT]
  );
  const out: CorrelationSignalRow[] = [];
  for (const r of rows) {
    const pair = `${r.base}/${r.quote}`;
    const change = Number(r.change_pct);
    out.push({
      signalType: 'fx_move',
      entityKey: `fx:${pair}`,
      title: `${pair} ${change >= 0 ? '↑' : '↓'} ${change.toFixed(2)}%`,
      description: `${pair} ${r.prev_rate} → ${r.rate} on ${r.rate_date}`,
      confidence: Math.min(1, 0.6 + Math.abs(change) / 5),
      magnitude: Math.abs(change),
      baseline: r.prev_rate ? Number(r.prev_rate) : null,
      observed: r.rate ? Number(r.rate) : null,
      related: { rateDate: r.rate_date },
      raw: { pair, change_pct: change },
    });
  }
  return out;
}

// ─── Detector: prediction_swing ───────────────────────────────────
//
// Compare the latest snapshot for each prediction market against the
// snapshot ~60 min earlier. If both exist and |Δp| ≥ 5pp, fire a
// signal. Limited to currently-open binary markets that have at least
// 100 USD/MANA of volume to avoid noise from zombie markets.
async function detectPredictionSwings(db: DbLike): Promise<CorrelationSignalRow[]> {
  const rows = await db.queryAll(
    `WITH latest AS (
       SELECT DISTINCT ON (s.market_id)
              s.market_id, s.probability AS latest_prob, s.captured_at AS latest_at
         FROM wm_prediction_market_snapshots s
        WHERE s.captured_at > NOW() - INTERVAL '20 minutes'
          AND s.probability IS NOT NULL
        ORDER BY s.market_id, s.captured_at DESC
     ),
     earlier AS (
       SELECT DISTINCT ON (s.market_id)
              s.market_id, s.probability AS earlier_prob, s.captured_at AS earlier_at
         FROM wm_prediction_market_snapshots s
        WHERE s.captured_at BETWEEN NOW() - INTERVAL '120 minutes'
                                AND NOW() - INTERVAL '40 minutes'
          AND s.probability IS NOT NULL
        ORDER BY s.market_id, s.captured_at DESC
     )
     SELECT m.id, m.source, m.source_market_id, m.question, m.url,
            m.category, m.volume, m.market_type, m.status,
            l.latest_prob, l.latest_at,
            e.earlier_prob, e.earlier_at
       FROM wm_prediction_markets m
       JOIN latest l ON l.market_id = m.id
       JOIN earlier e ON e.market_id = m.id
      WHERE m.status = 'open'
        AND m.market_type = 'binary'
        AND COALESCE(m.volume, 0) >= 100
        AND ABS(l.latest_prob - e.earlier_prob) >= $1`,
    [PREDICTION_SWING_PP]
  );

  const out: CorrelationSignalRow[] = [];
  for (const r of rows) {
    const latest = Number(r.latest_prob);
    const earlier = Number(r.earlier_prob);
    const delta = latest - earlier;
    const dir = delta >= 0 ? 'up' : 'down';
    const pp = (Math.abs(delta) * 100).toFixed(1);
    out.push({
      signalType: 'prediction_swing',
      entityKey: `pred:${r.source}:${r.source_market_id}`,
      title: `${r.source} swing ${dir} ${pp}pp: ${String(r.question).slice(0, 80)}`,
      description: `Probability ${(earlier * 100).toFixed(1)}% → ${(latest * 100).toFixed(1)}% (Δ${(delta * 100).toFixed(1)}pp) over the last hour`,
      confidence: Math.min(1, 0.55 + Math.abs(delta) * 4),
      magnitude: Math.abs(delta) * 100,
      baseline: earlier,
      observed: latest,
      related: {
        marketId: r.id,
        url: r.url,
        category: r.category,
        volume: r.volume,
        latestAt: r.latest_at,
        earlierAt: r.earlier_at,
      },
      raw: { source: r.source, sourceMarketId: r.source_market_id },
    });
  }
  return out;
}

// ─── Detector: cve_critical ───────────────────────────────────────
async function detectCriticalCves(db: DbLike): Promise<CorrelationSignalRow[]> {
  const rows = await db.queryAll(
    `SELECT cve_id, cvss_score, cvss_severity, kev_flag, kev_added_date,
            published_at, vendors, products, description
       FROM wm_cyber_cves
      WHERE (
              (cvss_score IS NOT NULL AND cvss_score >= $1)
              OR (kev_flag = TRUE AND kev_added_date >= CURRENT_DATE - INTERVAL '30 days')
            )
        AND (published_at >= NOW() - INTERVAL '7 days'
             OR (kev_flag = TRUE AND kev_added_date >= CURRENT_DATE - INTERVAL '7 days'))
      ORDER BY published_at DESC
      LIMIT 200`,
    [CVE_MIN_CRITICAL]
  );

  const out: CorrelationSignalRow[] = [];
  for (const r of rows) {
    const cveId = String(r.cve_id);
    const score = r.cvss_score ? Number(r.cvss_score) : null;
    const isKev = r.kev_flag === true;
    const labelBits: string[] = [];
    if (score !== null) labelBits.push(`CVSS ${score.toFixed(1)}`);
    if (isKev) labelBits.push('KEV');
    const products = Array.isArray(r.products) ? r.products.slice(0, 3).join(', ') : '';
    out.push({
      signalType: 'cve_critical',
      entityKey: `cve:${cveId}`,
      title: `${cveId} ${labelBits.join(' · ') || 'critical'}${products ? ` — ${products}` : ''}`,
      description: r.description ? String(r.description).slice(0, 500) : null,
      confidence: isKev ? 0.95 : 0.8,
      magnitude: score,
      baseline: null,
      observed: score,
      related: { vendors: r.vendors, products: r.products, kev: isKev },
      raw: { cveId, score, kev: isKev, publishedAt: r.published_at },
    });
  }
  return out;
}

// ─── Detector: outage_started ─────────────────────────────────────
async function detectNewOutages(db: DbLike): Promise<CorrelationSignalRow[]> {
  const rows = await db.queryAll(
    `SELECT source_id, location_code, location_name, scope, asn, asn_name,
            event_type, description, link_url, start_date, is_ongoing
       FROM wm_internet_outages
      WHERE start_date >= NOW() - INTERVAL '24 hours'
      ORDER BY start_date DESC
      LIMIT 100`
  );
  const out: CorrelationSignalRow[] = [];
  for (const r of rows) {
    const country = r.location_name || r.location_code || 'unknown';
    const eventType = r.event_type ? String(r.event_type) : 'outage';
    const ongoingTag = r.is_ongoing ? ' (ongoing)' : '';
    out.push({
      signalType: 'outage_started',
      entityKey: `outage:cf:${r.source_id}`,
      title: `Internet outage in ${country}${ongoingTag} — ${eventType}`,
      description: r.description ? String(r.description).slice(0, 500) : null,
      confidence: r.is_ongoing ? 0.9 : 0.75,
      magnitude: null,
      baseline: null,
      observed: null,
      related: {
        country,
        scope: r.scope,
        asn: r.asn,
        asnName: r.asn_name,
        link: r.link_url,
        startDate: r.start_date,
      },
      raw: { sourceId: r.source_id, eventType },
    });
  }
  return out;
}

/**
 * Run all correlation detectors and persist the resulting signals.
 *
 * Returns counts per detector + a total emitted count.
 */
export async function runCorrelationDetectors(db: DbLike): Promise<{
  marketMoves: number;
  cryptoMoves: number;
  fxMoves: number;
  predictionSwings: number;
  cveCriticals: number;
  newOutages: number;
  emitted: number;
  skippedDup: number;
  durationMs: number;
}> {
  const t0 = Date.now();

  const detectors: Array<[string, Promise<CorrelationSignalRow[]>]> = [
    ['marketMoves',      detectMarketMoves(db)],
    ['cryptoMoves',      detectCryptoMoves(db)],
    ['fxMoves',          detectFxMoves(db)],
    ['predictionSwings', detectPredictionSwings(db)],
    ['cveCriticals',     detectCriticalCves(db)],
    ['newOutages',       detectNewOutages(db)],
  ];

  const results: Record<string, number> = {
    marketMoves: 0, cryptoMoves: 0, fxMoves: 0,
    predictionSwings: 0, cveCriticals: 0, newOutages: 0,
  };
  let emitted = 0;
  let skippedDup = 0;

  for (const [name, p] of detectors) {
    let candidates: CorrelationSignalRow[] = [];
    try {
      candidates = await p;
    } catch (err) {
      console.warn(`[correlation] detector ${name} failed:`, (err as Error).message);
      continue;
    }
    results[name] = candidates.length;
    for (const sig of candidates) {
      if (await isRecentDuplicate(db, sig.signalType, sig.entityKey)) {
        skippedDup++;
        continue;
      }
      const ok = await persistSignal(db, sig);
      if (ok) emitted++;
    }
  }

  return {
    marketMoves: results.marketMoves || 0,
    cryptoMoves: results.cryptoMoves || 0,
    fxMoves: results.fxMoves || 0,
    predictionSwings: results.predictionSwings || 0,
    cveCriticals: results.cveCriticals || 0,
    newOutages: results.newOutages || 0,
    emitted,
    skippedDup,
    durationMs: Date.now() - t0,
  };
}

/**
 * Cleanup signals older than retentionDays.
 */
export async function cleanupOldCorrelationSignals(db: DbLike, retentionDays: number): Promise<number> {
  const r = await db.queryOne(
    `WITH del AS (DELETE FROM wm_correlation_signals
                  WHERE fired_at < NOW() - ($1::int * INTERVAL '1 day')
                  RETURNING id)
     SELECT COUNT(*)::int AS deleted FROM del`,
    [retentionDays]
  );
  return (r?.deleted as number) || 0;
}
