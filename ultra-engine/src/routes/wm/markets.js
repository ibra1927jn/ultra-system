const express = require('express');
const db = require('../../db');
const { COUNTRY_ALIASES, TOPIC_KEYWORDS, getCountryTerms, buildTopicRegex, buildCountryRegex } = require('./constants');
const router = express.Router();

router.get('/markets/snapshot', async (req, res) => {
  try {
    const [indices, commodities, crypto, fx, energy, macro, signals, predictions, topMovers] = await Promise.all([
      db.queryAll(`
        SELECT DISTINCT ON (symbol) symbol, display, price, change_pct, category, market_state
        FROM wm_market_quotes
        WHERE category = 'index' AND symbol IN ('^GSPC','^DJI','^IXIC','^VIX','^FTSE','^N225','^HSI','^STOXX50E')
        ORDER BY symbol, observed_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (symbol) symbol, display, price, change_pct
        FROM wm_market_quotes
        WHERE category = 'commodity'
        ORDER BY symbol, observed_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (symbol) symbol, name, price_usd, change_24h_pct, change_7d_pct, market_cap_usd, btc_dominance_pct
        FROM wm_crypto_quotes
        WHERE symbol IN ('BTC','ETH','XRP','SOL','BNB','ADA','DOGE')
        ORDER BY symbol, observed_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (base, quote) base, quote, rate, change_pct
        FROM wm_fx_rates
        WHERE base = 'USD' AND quote IN ('EUR','GBP','JPY','CNY','NZD','CHF','AUD','CAD','MXN','TRY','ZAR')
        ORDER BY base, quote, fetched_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (display) display, value, unit, change_pct, period
        FROM wm_energy_inventories
        ORDER BY display, fetched_at DESC
      `),
      db.queryAll(`
        SELECT DISTINCT ON (display) display, area, value, unit, change_pct
        FROM wm_macro_indicators
        ORDER BY display, fetched_at DESC
        LIMIT 12
      `),
      db.queryAll(`
        SELECT signal_type, title, confidence, magnitude, fired_at
        FROM wm_correlation_signals
        ORDER BY fired_at DESC
        LIMIT 8
      `),
      // Top prediction markets by volume
      db.queryAll(`
        SELECT question, probability, volume, source, category, url
        FROM wm_prediction_markets
        WHERE status = 'open' AND probability BETWEEN 0.05 AND 0.95
        ORDER BY volume DESC NULLS LAST
        LIMIT 12
      `),
      // Top market movers (biggest % changes)
      db.queryAll(`
        WITH latest AS (
          SELECT DISTINCT ON (symbol) symbol, display, price, change_pct, category
          FROM wm_market_quotes
          WHERE change_pct IS NOT NULL
          ORDER BY symbol, observed_at DESC
        )
        SELECT * FROM latest ORDER BY ABS(change_pct) DESC LIMIT 10
      `)
    ]);

    // Build KPIs
    const vix = indices.find(i => i.symbol === '^VIX');
    const spx = indices.find(i => i.symbol === '^GSPC');
    const btc = crypto.find(c => c.symbol === 'BTC');
    const gold = commodities.find(c => (c.display||'').toUpperCase().includes('GOLD') || c.symbol === 'GC=F');
    const oil = commodities.find(c => (c.display||'').toUpperCase().includes('OIL') || c.symbol === 'CL=F');
    const dxy = indices.find(i => (i.display||'').toUpperCase() === 'DXY') || null;
    const kpis = {
      vix: vix ? { value: vix.price, change: vix.change_pct } : null,
      spx: spx ? { value: spx.price, change: spx.change_pct } : null,
      btc: btc ? { value: btc.price_usd, change: btc.change_24h_pct, dominance: btc.btc_dominance_pct } : null,
      gold: gold ? { value: gold.price, change: gold.change_pct } : null,
      oil: oil ? { value: oil.price, change: oil.change_pct } : null,
      dxy: dxy ? { value: dxy.price, change: dxy.change_pct } : null,
    };

    res.json({ ok: true, data: { indices, commodities, crypto, fx, energy, macro, signals, predictions, topMovers, kpis } });
  } catch (err) {
    console.error('❌ /api/wm/markets/snapshot error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/intelligence-brief ─ Synthesized daily brief ────────
router.get('/intelligence-brief', async (req, res) => {
  try {
    const [signalSummary, focalPoints, topClusters, topicSpikes, trendingKw, gdeltAlerts, marketMovers, topPredictions] = await Promise.all([
      db.queryAll(`SELECT ai_context, top_countries, convergence_zones, by_type, observed_at FROM wm_signal_summary ORDER BY created_at DESC LIMIT 1`),
      db.queryAll(`SELECT display_name, urgency, narrative, focal_score, entity_id, news_mentions, correlation_evidence FROM wm_focal_points ORDER BY focal_score DESC LIMIT 6`),
      db.queryAll(`SELECT primary_title, source_count, threat_level, threat_category, last_seen, primary_link FROM wm_clusters WHERE source_count >= 3 ORDER BY last_seen DESC LIMIT 8`),
      db.queryAll(`SELECT topic, velocity, article_count, prev_count FROM wm_topic_trends WHERE is_spike = true ORDER BY velocity DESC LIMIT 5`),
      db.queryAll(`SELECT term, multiplier, mention_count, sample_headlines FROM wm_trending_keywords ORDER BY multiplier DESC NULLS LAST LIMIT 10`),
      db.queryAll(`SELECT country, z_score, severity, top_title, current_volume FROM wm_gdelt_volume_alerts ORDER BY z_score DESC LIMIT 5`),
      db.queryAll(`WITH latest AS (SELECT DISTINCT ON (symbol) symbol, display, price, change_pct, category FROM wm_market_quotes WHERE change_pct IS NOT NULL ORDER BY symbol, observed_at DESC) SELECT * FROM latest ORDER BY ABS(change_pct) DESC LIMIT 5`),
      db.queryAll(`SELECT question, probability, volume, source FROM wm_prediction_markets WHERE status='open' AND probability BETWEEN 0.05 AND 0.95 AND (category @> ARRAY['geopolitics'] OR category @> ARRAY['politics']) ORDER BY volume DESC NULLS LAST LIMIT 5`)
    ]);

    // Build nexus connections: match market movers to news events
    const nexus = [];
    // Keyword groups for nexus matching
    const nexusKeywords = {
      vix: ['fear','volatility','crash','panic','risk','uncertainty','war','conflict','crisis','sanctions','tariff','recession'],
      oil: ['oil','hormuz','iran','opec','strait','blockade','energy','pipeline','crude','saudi','petroleum','refinery','barrel'],
      gold: ['gold','war','conflict','crisis','sanction','nuclear','inflation','safe haven','uncertainty','geopolit'],
      spx: ['stocks','wall street','nasdaq','rally','selloff','fed','interest rate','earnings','recession','gdp','tariff'],
      tech: ['tech','ai','semiconductor','chip','nvidia','apple','google','meta','layoff','regulation'],
    };

    for (const mover of marketMovers) {
      const sym = (mover.display || mover.symbol || '').toLowerCase();
      const chg = parseFloat(mover.change_pct) || 0;

      // Determine which keyword group applies
      let matchKws = [];
      if (sym.includes('vix')) matchKws = nexusKeywords.vix;
      else if (sym.includes('oil') || sym.includes('cl=f') || sym.includes('crude')) matchKws = nexusKeywords.oil;
      else if (sym.includes('gold') || sym.includes('gc=f')) matchKws = nexusKeywords.gold;
      else if (sym.includes('spx') || sym.includes('dow') || sym.includes('nasdaq') || sym.includes('^gspc') || sym.includes('^dji') || sym.includes('^ixic')) matchKws = nexusKeywords.spx;
      else if (mover.category === 'stock') {
        // For individual stocks, match against their specific name
        const stockName = (mover.display || mover.symbol || '').toLowerCase();
        matchKws = [stockName.replace(/[^a-z]/g,'')];
      }

      // Search all top events + focal points for keyword matches
      let relatedClusters = [];
      if (matchKws.length > 0) {
        relatedClusters = topClusters.filter(c => {
          const t = (c.primary_title || '').toLowerCase();
          return matchKws.some(kw => t.includes(kw));
        }).slice(0, 2);
        // Also match threat level for broad market movers
        if (relatedClusters.length === 0 && (sym.includes('vix') || sym.includes('spx'))) {
          relatedClusters = topClusters.filter(c => c.threat_level === 'high' || c.threat_level === 'critical').slice(0, 2);
        }
      }

      if (relatedClusters.length > 0) {
        nexus.push({
          symbol: mover.display || mover.symbol,
          price: mover.price,
          change_pct: mover.change_pct,
          category: mover.category,
          likely_drivers: relatedClusters.map(c => ({
            title: c.primary_title,
            sources: c.source_count,
            link: c.primary_link
          }))
        });
      }
    }

    res.json({
      ok: true,
      data: {
        signal_context: signalSummary[0]?.ai_context || null,
        convergence_zones: signalSummary[0]?.convergence_zones || [],
        top_countries: signalSummary[0]?.top_countries || [],
        focal_points: focalPoints,
        top_events: topClusters,
        topic_spikes: topicSpikes,
        trending: trendingKw,
        gdelt_alerts: gdeltAlerts,
        nexus,
        geo_predictions: topPredictions,
        generated_at: signalSummary[0]?.observed_at || new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('❌ /api/wm/intelligence-brief error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/markets/sparklines ─ Historical mini-charts ────────
router.get('/markets/sparklines', async (req, res) => {
  try {
    // Get 5-day hourly data for all key symbols
    const symbols = ['^GSPC', '^DJI', '^IXIC', '^VIX', 'GC=F', 'CL=F', 'SI=F', 'HG=F', 'NG=F'];
    const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'XRP'];

    const [marketData, cryptoData] = await Promise.all([
      db.queryAll(`
        SELECT symbol, price::float, observed_at
        FROM wm_market_quotes
        WHERE symbol = ANY($1) AND observed_at > NOW() - INTERVAL '5 days'
        ORDER BY symbol, observed_at
      `, [symbols]),
      db.queryAll(`
        SELECT symbol, price_usd::float as price, observed_at
        FROM wm_crypto_quotes
        WHERE symbol = ANY($1) AND observed_at > NOW() - INTERVAL '5 days'
        ORDER BY symbol, observed_at
      `, [cryptoSymbols])
    ]);

    // Group by symbol, downsample to ~50 points per symbol
    const sparklines = {};
    const allData = [...marketData, ...cryptoData];
    const bySymbol = {};
    allData.forEach(d => {
      if (!bySymbol[d.symbol]) bySymbol[d.symbol] = [];
      bySymbol[d.symbol].push({ p: d.price, t: d.observed_at });
    });

    for (const [sym, points] of Object.entries(bySymbol)) {
      const step = Math.max(1, Math.floor(points.length / 50));
      sparklines[sym] = points.filter((_, i) => i % step === 0 || i === points.length - 1)
        .map(p => p.p);
    }

    res.json({ ok: true, data: sparklines });
  } catch (err) {
    console.error('❌ /api/wm/markets/sparklines error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/search ─ Full-text article search with ranking ──
// Uses PostgreSQL ts_vector (language-agnostic "simple" config) + ts_rank
// to score matches by term frequency, proximity and density.
// Query by title OR summary OR auto_summary across all languages.
// Usage: GET /api/wm/search?q=ukraine+drone&limit=30&hours=168

module.exports = router;
