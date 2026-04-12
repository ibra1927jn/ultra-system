// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Daily Intelligence Digest (DEPTH-3)      ║
// ║                                                          ║
// ║  Auto-generated morning briefing sent via Telegram:      ║
// ║  - Top events (clustered) by region                      ║
// ║  - Trending topics (spikes)                              ║
// ║  - Hotspot changes                                       ║
// ║  - Prediction market movers                              ║
// ║  - Country sentiment shifts                              ║
// ║  - System health summary                                 ║
// ╚══════════════════════════════════════════════════════════╝

'use strict';

const db = require('./db');
const telegram = require('./telegram');

async function generateDigest() {
  const sections = [];

  // ─── 1. Top events (clusters with most sources) ───
  const topEvents = await db.queryAll(`
    SELECT c.headline, c.article_count, c.countries,
      ev.event_type, ev.actors, ev.location
    FROM wm_event_clusters c
    LEFT JOIN wm_events ev ON ev.cluster_id = c.id
    WHERE c.status = 'active'
      AND c.last_updated > NOW() - INTERVAL '24 hours'
    ORDER BY c.article_count DESC
    LIMIT 10
  `);
  if (topEvents.length > 0) {
    let s = '📰 *TOP EVENTS (24h)*\n';
    for (let i = 0; i < topEvents.length; i++) {
      const e = topEvents[i];
      const type = e.event_type ? `[${e.event_type}]` : '';
      const countries = e.countries?.length ? ` 🌍${e.countries.slice(0, 3).join(',')}` : '';
      const sources = `(${e.article_count} sources)`;
      s += `${i + 1}. ${type} ${e.headline.slice(0, 120)}${countries} ${sources}\n`;
    }
    sections.push(s);
  }

  // ─── 2. Trending topics (spikes in last 6h) ───
  const spikes = await db.queryAll(`
    SELECT topic, article_count, velocity, sample_titles
    FROM wm_topic_trends
    WHERE is_spike = true
      AND computed_at > NOW() - INTERVAL '6 hours'
      AND window_hours = 6
    ORDER BY velocity DESC
    LIMIT 5
  `);
  if (spikes.length > 0) {
    let s = '📈 *TRENDING TOPICS*\n';
    for (const sp of spikes) {
      const vel = sp.velocity > 500 ? '🔥' : '⬆️';
      s += `${vel} ${sp.topic} — ${sp.article_count} articles (+${Math.round(sp.velocity)}%)\n`;
    }
    sections.push(s);
  }

  // ─── 3. Hotspot escalation changes ───
  const hotspots = await db.queryAll(`
    SELECT hotspot_id, combined_score, prev_combined_score, trend, news_matches
    FROM wm_hotspot_escalation
    WHERE combined_score >= 3.0
    ORDER BY combined_score DESC
    LIMIT 8
  `);
  if (hotspots.length > 0) {
    let s = '🎯 *HOTSPOTS*\n';
    for (const h of hotspots) {
      const prev = Number(h.prev_combined_score) || 0;
      const curr = Number(h.combined_score);
      const delta = curr - prev;
      const arrow = delta > 0.2 ? '🔺' : delta < -0.2 ? '🔻' : '➡️';
      s += `${arrow} ${h.hotspot_id}: ${curr.toFixed(1)} (${delta >= 0 ? '+' : ''}${delta.toFixed(1)}) — ${h.news_matches} news\n`;
    }
    sections.push(s);
  }

  // ─── 4. Prediction market movers (biggest 24h probability changes) ───
  const marketMovers = await db.queryAll(`
    WITH latest AS (
      SELECT market_id, probability,
        ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY captured_at DESC) as rn
      FROM wm_prediction_market_snapshots
      WHERE captured_at > NOW() - INTERVAL '2 hours'
    ),
    day_ago AS (
      SELECT market_id, probability,
        ROW_NUMBER() OVER (PARTITION BY market_id ORDER BY captured_at DESC) as rn
      FROM wm_prediction_market_snapshots
      WHERE captured_at BETWEEN NOW() - INTERVAL '26 hours' AND NOW() - INTERVAL '22 hours'
    )
    SELECT m.question, m.source,
      l.probability as current_prob,
      d.probability as prev_prob,
      (l.probability - d.probability) as delta
    FROM latest l
    JOIN day_ago d ON d.market_id = l.market_id AND d.rn = 1
    JOIN wm_prediction_markets m ON m.id = l.market_id
    WHERE l.rn = 1
      AND ABS(l.probability - d.probability) > 0.05
    ORDER BY ABS(l.probability - d.probability) DESC
    LIMIT 5
  `);
  if (marketMovers.length > 0) {
    let s = '📊 *PREDICTION MARKET MOVERS (24h)*\n';
    for (const m of marketMovers) {
      const delta = Number(m.delta);
      const arrow = delta > 0 ? '🟢' : '🔴';
      const pct = (delta * 100).toFixed(1);
      const curr = (Number(m.current_prob) * 100).toFixed(0);
      s += `${arrow} ${m.question.slice(0, 100)} → ${curr}% (${delta > 0 ? '+' : ''}${pct}pp)\n`;
    }
    sections.push(s);
  }

  // ─── 5. Country sentiment notable shifts ───
  const sentShifts = await db.queryAll(`
    SELECT country_iso2, article_count, negative_pct, positive_pct, avg_score,
      top_negative
    FROM wm_country_sentiment
    WHERE period_date = CURRENT_DATE
      AND article_count >= 5
    ORDER BY negative_pct DESC
    LIMIT 5
  `);
  if (sentShifts.length > 0) {
    let s = '🌡️ *COUNTRY SENTIMENT (today)*\n';
    for (const c of sentShifts) {
      const neg = Number(c.negative_pct).toFixed(0);
      const pos = Number(c.positive_pct).toFixed(0);
      s += `${c.country_iso2}: ${neg}% neg / ${pos}% pos (${c.article_count} articles)\n`;
    }
    sections.push(s);
  }

  // ─── 6. System health ───
  const health = await db.queryOne(`
    SELECT
      (SELECT COUNT(*) FROM rss_feeds WHERE is_active) as feeds,
      (SELECT COUNT(*) FROM rss_articles WHERE created_at > NOW() - INTERVAL '24 hours') as articles_24h,
      (SELECT COUNT(*) FROM rss_articles_enrichment WHERE enriched_at > NOW() - INTERVAL '24 hours') as enriched_24h,
      (SELECT COUNT(*) FROM wm_event_clusters WHERE status='active') as active_clusters,
      (SELECT COUNT(*) FROM scheduler_log WHERE executed_at > NOW() - INTERVAL '24 hours' AND status != 'success') as cron_errors
  `);
  let s = '⚙️ *SYSTEM*\n';
  s += `Feeds: ${health.feeds} | Articles/24h: ${health.articles_24h} | Enriched: ${health.enriched_24h}\n`;
  s += `Clusters: ${health.active_clusters} | Cron errors: ${health.cron_errors}`;
  sections.push(s);

  // ─── Compose and send ───
  const header = `🌐 *ULTRA DAILY BRIEFING*\n📅 ${new Date().toISOString().split('T')[0]}\n${'━'.repeat(30)}\n`;
  const digest = header + sections.join('\n' + '─'.repeat(25) + '\n');

  // Send via Telegram (split if too long)
  const MAX_LEN = 4000;
  if (digest.length <= MAX_LEN) {
    await telegram.sendAlert(digest);
  } else {
    // Send in chunks
    for (let i = 0; i < sections.length; i++) {
      const chunk = i === 0 ? header + sections[i] : sections[i];
      await telegram.sendAlert(chunk);
    }
  }

  return { sections: sections.length, length: digest.length };
}

module.exports = { generateDigest };
