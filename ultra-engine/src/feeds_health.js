// ════════════════════════════════════════════════════════════
//  Feeds Health Check — P1 P0 #2
//
//  Audita silenciosamente la salud de los 750+ feeds RSS de P1 y
//  envía un resumen Telegram cuando detecta degradación.
//
//  Detecciones:
//    - never_fetched: feeds activos con last_fetched IS NULL
//    - stale_24h:    feeds activos con last_fetched < NOW() - 24h
//    - stale_72h:    crítico — alerta hard
//
//  Output:
//    - Log estructurado al stdout (siempre)
//    - Telegram resumen SOLO cuando hay degradación nueva o crítica.
//      Pasivo: si todo está bien, silencio (no notifica).
//
//  Llamado por scheduler cron `feeds-health-check` cada 6h.
// ════════════════════════════════════════════════════════════

'use strict';

const db = require('./db');
const telegram = require('./telegram');

// Solo emitir alerta Telegram si total problemas >= esto. Bajo este
// umbral solo log al stdout (evita ruido por 1-2 feeds caídos).
const TELEGRAM_THRESHOLD = 5;

async function runFeedsHealthCheck() {
  const startedAt = Date.now();

  // Single query — agrupa por bucket de salud
  const rows = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE is_active = true)                                                  AS active_total,
      COUNT(*) FILTER (WHERE is_active = true AND last_fetched IS NULL)                          AS never_fetched,
      COUNT(*) FILTER (WHERE is_active = true AND last_fetched IS NOT NULL
                              AND last_fetched < NOW() - INTERVAL '24 hours'
                              AND last_fetched >= NOW() - INTERVAL '72 hours')                   AS stale_24h,
      COUNT(*) FILTER (WHERE is_active = true AND last_fetched IS NOT NULL
                              AND last_fetched < NOW() - INTERVAL '72 hours')                    AS stale_72h,
      COUNT(*) FILTER (WHERE is_active = true AND last_fetched > NOW() - INTERVAL '2 hours')     AS fresh_2h
    FROM rss_feeds
  `);
  const summary = rows.rows[0];

  // Top offenders (limit 15) — feeds problemáticos para detalle
  const offenders = await db.query(`
    SELECT id, name, category, target_pillar, last_fetched
    FROM rss_feeds
    WHERE is_active = true
      AND (last_fetched IS NULL OR last_fetched < NOW() - INTERVAL '24 hours')
    ORDER BY (last_fetched IS NULL) DESC, last_fetched ASC NULLS FIRST
    LIMIT 15
  `);

  const total = Number(summary.active_total) || 0;
  const never = Number(summary.never_fetched) || 0;
  const stale24 = Number(summary.stale_24h) || 0;
  const stale72 = Number(summary.stale_72h) || 0;
  const fresh2 = Number(summary.fresh_2h) || 0;
  const problems = never + stale24 + stale72;
  const healthPct = total ? Math.round(((total - problems) / total) * 100) : 0;

  console.log(
    `🩺 feeds-health: active=${total} fresh_2h=${fresh2} never=${never} stale_24h=${stale24} stale_72h=${stale72} health=${healthPct}%`
  );

  // Decide if Telegram alert is warranted
  const shouldAlert = problems >= TELEGRAM_THRESHOLD || stale72 > 0;
  if (!shouldAlert) {
    return {
      total, fresh2, never, stale24, stale72, healthPct,
      alerted: false,
      elapsedMs: Date.now() - startedAt,
    };
  }

  // Build Telegram message
  const lines = [
    `🩺 *Feeds health* — ${healthPct}% sano`,
    ``,
    `📊 ${total} activos | ${fresh2} fresh<2h`,
    `🟡 ${stale24} stale 24-72h`,
    `🔴 ${stale72} stale >72h`,
    `⚪ ${never} nunca fetched`,
  ];

  if (offenders.rows.length) {
    lines.push('');
    lines.push('*Top offenders:*');
    for (const f of offenders.rows.slice(0, 10)) {
      const tag = f.last_fetched
        ? new Date(f.last_fetched).toISOString().slice(0, 10)
        : 'never';
      const name = String(f.name || '').slice(0, 40).replace(/[*_`\[\]]/g, '');
      const cat = f.category || '?';
      lines.push(`• \`${tag}\` ${name} (${cat})`);
    }
  }

  try {
    await telegram.sendAlert(lines.join('\n'), 'Markdown');
  } catch (err) {
    console.error('feeds-health: telegram send failed:', err.message);
  }

  return {
    total, fresh2, never, stale24, stale72, healthPct,
    alerted: true,
    offenders: offenders.rows.length,
    elapsedMs: Date.now() - startedAt,
  };
}

module.exports = { runFeedsHealthCheck };
