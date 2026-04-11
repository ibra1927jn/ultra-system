// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bot de Telegram                          ║
// ║  Reemplaza n8n para envio de alertas + comandos          ║
// ║  Comandos smart: budget, pipeline, bio, logistica        ║
// ╚══════════════════════════════════════════════════════════╝

const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

let bot = null;

/**
 * Inicializa el bot de Telegram
 */
function init() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || token === 'not_configured' || token.includes('CAMBIA_ESTO')) {
    console.warn('⚠️ Telegram no configurado (token ausente). Bot desactivado.');
    return null;
  }

  if (!chatId || chatId === 'not_configured') {
    console.warn('⚠️ TELEGRAM_CHAT_ID no configurado. Alertas automaticas no funcionaran.');
  }

  try {
    bot = new TelegramBot(token, { polling: true });
  } catch (err) {
    console.error('❌ Error inicializando bot de Telegram:', err.message);
    bot = null;
    return null;
  }

  console.log('📲 Bot de Telegram conectado (chat_id:', chatId, ')');

  // ─── Comandos basicos ─────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    send(msg.chat.id, '🌎 *ULTRA SYSTEM* activo\\.\nUsa /help para ver comandos\\.', 'MarkdownV2');
  });

  bot.onText(/\/help/, (msg) => {
    const help = [
      '🤖 *Comandos disponibles:*',
      '',
      '📋 _Basicos:_',
      '/status — Estado general del sistema',
      '/docs — Documentos proximos a caducar',
      '/impuestos — Recordatorios fiscales (NZ/ES/AU)',
      '/vacunas — Vacunaciones registradas',
      '/apostillas — Apostillas legalizadas',
      '/licencias — Licencias de conducir',
      '/militar — Obligaciones militares (DZ)',
      '/macros [w h age sex activity goal] — TDEE + macros',
      '/sueno — Sleep score último bio_check',
      '/schengen — Días Schengen 90/180 disponibles',
      '/visa ES NZ — Requisitos visado (passport→destino)',
      '/viaje DZ 2026-05-01 FR — Log entrada Schengen',
      '/govwatch — Páginas gov vigiladas + cambios recientes',
      '/embajada ES NZ — Embajada/consulado por país',
      '/paperless — Status + últimos documentos OCR',
      '/alertas — Historial de alertas enviadas',
      '/ping — Verificar que el bot funciona',
      '',
      '📰 _P1 Noticias:_',
      '/world — WorldMonitor snapshot (CII + focal + trending + clusters)',
      '/feeds — Ultimas noticias',
      '/gdelt — GDELT global recientes',
      '/bsky — Bluesky relevantes',
      '/noticias\\_config — Keywords de scoring RSS',
      '/events — Early warning (USGS+WHO+ACLED)',
      '',
      '💰 _P3 Finanzas:_',
      '/finanzas — Resumen financiero mensual',
      '/presupuesto — Budget + runway + alertas',
      '/runway — Runway extendido + breakdown cuentas',
      '/fx — Tipos de cambio NZD→{EUR,USD,...}',
      '/recurring — Gastos recurrentes detectados',
      '/savings — Savings goals + progreso',
      '/nw — Net worth timeline (90d)',
      '/crypto — Holdings crypto + valuación NZD',
      '/portfolio — Stocks/ETFs portfolio (Stooq)',
      '',
      '💼 _P2 Empleo:_',
      '/jobs\\_top — Top empleos presenciales (ATS)',
      '/jobs\\_companies — Empresas tracked',
      '',
      '🎯 _P5 Oportunidades:_',
      '/oportunidades — Oportunidades activas',
      '/pipeline — Funnel de conversion',
      '/opps\\_top — Top high-score (RemoteOK/Remotive/HN/etc)',
      '/opps\\_sources — Stats por fuente',
      '',
      '🗺️ _P6 Logistica:_',
      '/logistica — Proximos 7 dias',
      '/proximas — Proximas 48 horas',
      '/poi — POIs cerca de current location (Overpass+DOC NZ)',
      '/iov [tipo] [km] — POIs iOverlander cerca (van-life, ~9K Canada)',
      '/clima — Forecast 7d Open-Meteo',
      '/donde — Ver/fijar current location (📎 location o `/donde Ciudad`)',
      '/memberships — Workaway/WWOOF/HelpX renewals',
      '/ruta lat1,lon1 lat2,lon2 — Compute route OSRM',
      '/gps — Última posición GPS',
      '',
      '🧬 _P7 Bio-Check:_',
      '/bio — Resumen semanal de salud',
      '/biosemana — Resumen + correlaciones',
      '/health — Outbreak alerts WHO/CDC/ECDC',
      '/external — Status 4 containers self-hosted',
      '/destino ID — Health check destino (outbreaks+vacunas)',
      '/ejercicio q — Buscar ejercicio (wger 414+)',
      '/comida BARCODE — Lookup nutrición (Open Food Facts)',
      '/mood 7 — Log mood 1-10 (opcional energy/anxiety)',
      '/cbt — Prompt CBT/DBT random para reflexión',
      '/diario — Últimas entradas journal',
      '/terapia ES — Directory mental health por país',
      '/sanidad ES — Sistema sanitario por país',
    ].join('\n');
    send(msg.chat.id, help, 'Markdown');
  });

  bot.onText(/\/ping/, (msg) => {
    send(msg.chat.id, '🏓 Pong\\! Ultra System operativo\\.', 'MarkdownV2');
  });

  bot.onText(/\/status/, async (msg) => {
    try {
      const health = await db.healthCheck();
      const docsResult = await db.queryOne(
        `SELECT COUNT(*) as total,
         COUNT(*) FILTER (WHERE (expiry_date - CURRENT_DATE) <= alert_days AND (expiry_date - CURRENT_DATE) >= 0) as urgentes
         FROM document_alerts WHERE is_active = TRUE`
      );
      const lines = [
        '📊 *ULTRA SYSTEM — Estado*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `🗄️ Base de datos: ${health.ok ? '✅ OK' : '❌ Error'}`,
        `📄 Documentos activos: ${docsResult?.total || 0}`,
        `⚠️ Alertas urgentes: ${docsResult?.urgentes || 0}`,
        `🕐 Hora servidor: ${new Date().toLocaleString('es-ES', { timeZone: process.env.TZ || 'UTC' })}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
      ];
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/docs/, async (msg) => {
    try {
      const docs = await db.queryAll(
        `SELECT document_name, document_type, expiry_date,
         (expiry_date - CURRENT_DATE) AS days_remaining, notes
         FROM document_alerts
         WHERE is_active = TRUE
         ORDER BY expiry_date ASC LIMIT 10`
      );

      if (!docs.length) {
        send(msg.chat.id, '✅ No hay documentos registrados.');
        return;
      }

      const message = formatDocumentAlert(docs);
      send(msg.chat.id, message, 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P1: Feeds RSS últimos artículos (excluye gdelt/bsky) ──
  bot.onText(/\/feeds/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT a.title, a.url, a.relevance_score, a.published_at, f.name AS feed_name, f.category
         FROM rss_articles a
         JOIN rss_feeds f ON f.id = a.feed_id
         WHERE COALESCE(f.category,'') NOT IN ('gdelt','bsky')
         ORDER BY a.relevance_score DESC NULLS LAST, a.published_at DESC NULLS LAST
         LIMIT 10`
      );
      if (!rows.length) {
        send(msg.chat.id, '📭 Sin artículos RSS todavía. El cron RSS corre periódicamente.');
        return;
      }
      const lines = ['📰 *Feeds RSS — Últimos relevantes*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows) {
        const date = r.published_at ? new Date(r.published_at).toISOString().split('T')[0] : '';
        const score = r.relevance_score != null ? `⭐ ${r.relevance_score}` : '';
        lines.push(`${score} · ${date} · _${r.feed_name}_`);
        lines.push(`   ${(r.title || '').substring(0, 150)}`);
        lines.push(`   🔗 ${r.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P1 → P2/P3/P4/P5: cross-pillar intel (B6) ────────
  // /cpi               → últimos 12 (todos los pilares)
  // /cpi P2|P3|P4|P5   → filtro por pilar destino
  // /cpi unread        → solo notified=FALSE (pendientes)
  bot.onText(/\/cpi(?:\s+(P[2-5]|unread))?/i, async (msg, match) => {
    try {
      const arg = match && match[1] ? match[1].toUpperCase() : null;
      const pillarFilter = arg && arg.startsWith('P') ? arg : null;
      const unreadOnly = arg === 'UNREAD';
      const conds = [];
      const params = [];
      if (pillarFilter) { params.push(pillarFilter); conds.push(`c.target_pillar = $${params.length}`); }
      if (unreadOnly)   { conds.push(`c.notified = FALSE`); }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      const rows = await db.queryAll(
        `SELECT c.target_pillar, c.pillar_topic, c.title, c.url, c.relevance_score,
                c.notified, c.created_at, f.name AS feed_name
         FROM cross_pillar_intel c
         LEFT JOIN rss_feeds f ON f.id = c.feed_id
         ${where}
         ORDER BY c.created_at DESC
         LIMIT 12`,
        params
      );
      const totals = await db.queryOne(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE notified = FALSE) AS unread
         FROM cross_pillar_intel`
      );
      if (!rows.length) {
        send(msg.chat.id, unreadOnly
          ? '📭 No hay cross-pillar intel pendiente.'
          : pillarFilter
            ? `📭 Sin cross-pillar intel para ${pillarFilter} todavía.`
            : '📭 Sin cross-pillar intel todavía. El cron RSS corre periódicamente.');
        return;
      }
      const header = unreadOnly
        ? `🌉 *Cross-pillar intel — pendientes (${totals.unread}/${totals.total})*`
        : pillarFilter
          ? `🌉 *Cross-pillar intel — ${pillarFilter}* (${totals.unread} pendientes / ${totals.total} total)`
          : `🌉 *Cross-pillar intel — últimos 12* (${totals.unread} pendientes / ${totals.total} total)`;
      const lines = [header, '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows) {
        const emoji = { P2: '💼', P3: '💰', P4: '🛂', P5: '🎯' }[r.target_pillar] || '📰';
        const topic = r.pillar_topic ? ` · #${r.pillar_topic}` : '';
        const score = r.relevance_score != null && r.relevance_score > 0 ? ` ⭐${r.relevance_score}` : '';
        const seen = r.notified ? '✅' : '🆕';
        const date = r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '';
        lines.push(`${emoji} *${r.target_pillar}*${topic}${score} ${seen}`);
        lines.push(`   ${date} · _${r.feed_name || 'feed'}_`);
        lines.push(`   ${(r.title || '').substring(0, 140)}`);
        lines.push(`   🔗 ${r.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('Filtros: `/cpi P2` `/cpi P3` `/cpi P4` `/cpi P5` `/cpi unread`');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P1 B4: GDELT GEO volume z-score alerts ────────
  // /cast            → últimas 12 alertas
  // /cast critical   → solo critical
  // /cast IR|US|...  → alerta de un país concreto si existe
  bot.onText(/\/cast(?:\s+([a-zA-Z]{2,8}))?/, async (msg, match) => {
    try {
      const arg = match && match[1] ? match[1].toUpperCase() : null;
      let where = '';
      const params = [];
      if (arg) {
        if (['LOW','MEDIUM','HIGH','CRITICAL'].includes(arg)) {
          params.push(arg.toLowerCase());
          where = `WHERE severity = $${params.length}`;
        } else if (/^[A-Z]{2}$/.test(arg)) {
          params.push(arg);
          where = `WHERE country = $${params.length}`;
        }
      }
      const rows = await db.queryAll(
        `SELECT country, alert_date, z_score, severity, current_volume,
                baseline_mean, current_tone, baseline_tone, top_url, top_title, notified
         FROM wm_gdelt_volume_alerts
         ${where}
         ORDER BY alert_date DESC, z_score DESC
         LIMIT 12`,
        params
      );
      if (!rows.length) {
        send(msg.chat.id, arg
          ? `📭 Sin alertas GDELT GEO para ${arg}.`
          : '📭 Sin alertas GDELT GEO todavía. El job corre cada 6h (00:22, 06:22, 12:22, 18:22).');
        return;
      }
      const sevEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
      const lines = [
        arg
          ? `🌍 *GDELT GEO alerts — ${arg}*`
          : '🌍 *GDELT GEO alerts — últimas 12*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
      ];
      for (const r of rows) {
        const e = sevEmoji[r.severity] || '⚪';
        const z = Number(r.z_score).toFixed(2);
        const vol = Number(r.current_volume).toFixed(4);
        const base = Number(r.baseline_mean).toFixed(4);
        const tone = r.current_tone != null ? Number(r.current_tone).toFixed(2) : '—';
        const baseTone = r.baseline_tone != null ? Number(r.baseline_tone).toFixed(2) : '—';
        const dateS = new Date(r.alert_date).toISOString().split('T')[0];
        lines.push(`${e} *${r.country}* · z=${z} · ${r.severity}`);
        lines.push(`   ${dateS}  vol=${vol} (base ${base})  tone=${tone} (base ${baseTone})`);
        if (r.top_title) lines.push(`   📰 ${String(r.top_title).substring(0, 130)}`);
        if (r.top_url) lines.push(`   🔗 ${r.top_url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('Filtros: `/cast critical` `/cast high` `/cast IR`');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P1: GDELT últimos artículos relevantes ────────
  bot.onText(/\/gdelt/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT a.title, a.url, a.relevance_score, a.published_at
         FROM rss_articles a
         JOIN rss_feeds f ON f.id = a.feed_id
         WHERE f.category = 'gdelt'
         ORDER BY a.relevance_score DESC, a.published_at DESC
         LIMIT 10`
      );
      if (!rows.length) {
        send(msg.chat.id, '📭 GDELT sin artículos todavía. El cron corre cada 2h.');
        return;
      }
      const lines = ['🌐 *GDELT — Últimos relevantes*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows) {
        const date = new Date(r.published_at).toISOString().split('T')[0];
        lines.push(`⭐ ${r.relevance_score} · ${date}`);
        lines.push(`   ${r.title.substring(0, 150)}`);
        lines.push(`   🔗 ${r.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P1: Bluesky últimos posts relevantes ──────────
  bot.onText(/\/bsky/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT a.title, a.url, a.relevance_score, a.summary, a.published_at
         FROM rss_articles a
         JOIN rss_feeds f ON f.id = a.feed_id
         WHERE f.category = 'bsky'
         ORDER BY a.relevance_score DESC, a.published_at DESC
         LIMIT 10`
      );
      if (!rows.length) {
        send(msg.chat.id, '🦋 Bluesky sin posts todavía. El cron corre cada hora.');
        return;
      }
      const lines = ['🦋 *Bluesky — Últimos relevantes*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows) {
        lines.push(`⭐ ${r.relevance_score}`);
        lines.push(`   ${r.title.substring(0, 200)}`);
        lines.push(`   🔗 ${r.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P1: WorldMonitor — snapshot agregado de las 4 tablas wm_* ──
  // Lee top países (CII), top focal points, top trending keywords y los
  // multi-source clusters más activos de las últimas 6h. Producido por
  // los crons wm-cluster-news, wm-focal-points, wm-country-scores,
  // wm-trending-keywords (Phase 2 del WorldMonitor absorption).
  bot.onText(/\/world/, async (msg) => {
    try {
      const limit = 5;
      const clusterHours = 6;

      const [countries, focalPoints, trending, clusters, totals] = await Promise.all([
        db.queryAll(
          `SELECT code, name, score, level, trend, change_24h
           FROM wm_country_scores
           ORDER BY score DESC, last_seen DESC
           LIMIT $1`,
          [limit]
        ),
        db.queryAll(
          `SELECT entity_id, entity_type, display_name,
                  news_mentions, focal_score, urgency
           FROM wm_focal_points
           ORDER BY focal_score DESC
           LIMIT $1`,
          [limit]
        ),
        db.queryAll(
          `SELECT term, mention_count, unique_sources, multiplier
           FROM wm_trending_keywords
           ORDER BY mention_count DESC
           LIMIT $1`,
          [limit]
        ),
        db.queryAll(
          `SELECT primary_title, primary_source, source_count, member_count
           FROM wm_clusters
           WHERE source_count > 1
             AND last_seen >= NOW() - ($1::int * INTERVAL '1 hour')
           ORDER BY source_count DESC, last_seen DESC
           LIMIT $2`,
          [clusterHours, limit]
        ),
        db.queryOne(
          `SELECT
             (SELECT COUNT(*) FROM wm_clusters)            AS clusters_total,
             (SELECT COUNT(*) FROM wm_focal_points)        AS fp_total,
             (SELECT COUNT(*) FROM wm_country_scores)      AS countries_total,
             (SELECT COUNT(*) FROM wm_trending_keywords)   AS trending_total`
        ),
      ]);

      const escMd = (s) => String(s || '').replace(/([_*`\[\]()])/g, '\\$1');
      const trendIcon = (t) => t === 'rising' ? '📈' : t === 'falling' ? '📉' : '➡️';
      const levelIcon = (l) => ({ critical: '🔴', high: '🟠', elevated: '🟡', normal: '🟢', low: '⚪️' }[l] || '⚪️');
      const urgencyIcon = (u) => ({ critical: '🔴', elevated: '🟡', watch: '⚪️' }[u] || '⚪️');

      const lines = [];
      lines.push('🌎 *WorldMonitor — Snapshot*');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`📊 \`clusters=${totals?.clusters_total || 0}  focal=${totals?.fp_total || 0}  countries=${totals?.countries_total || 0}  trending=${totals?.trending_total || 0}\``);
      lines.push('');

      lines.push('🌍 *Top países (CII)*');
      if (!countries.length) {
        lines.push('  _sin datos todavía_');
      } else {
        for (const c of countries) {
          const change = c.change_24h > 0 ? `+${c.change_24h}` : `${c.change_24h}`;
          lines.push(`${levelIcon(c.level)} ${trendIcon(c.trend)} *${escMd(c.name)}* ${c.score} (${change} 24h)`);
        }
      }
      lines.push('');

      lines.push('🎯 *Top focal points*');
      if (!focalPoints.length) {
        lines.push('  _sin datos todavía_');
      } else {
        for (const fp of focalPoints) {
          lines.push(`${urgencyIcon(fp.urgency)} *${escMd(fp.display_name)}* score=${Number(fp.focal_score).toFixed(0)} · ${fp.news_mentions} news`);
        }
      }
      lines.push('');

      lines.push('🔥 *Trending keywords (2h)*');
      if (!trending.length) {
        lines.push('  _sin datos todavía_');
      } else {
        for (const t of trending) {
          const mult = Number(t.multiplier) > 0 ? ` ${Number(t.multiplier).toFixed(1)}x` : '';
          lines.push(`  • *${escMd(t.term)}* — ${t.mention_count} menciones / ${t.unique_sources} fuentes${mult}`);
        }
      }
      lines.push('');

      lines.push(`📰 *Multi-source clusters (${clusterHours}h)*`);
      if (!clusters.length) {
        lines.push('  _sin clusters multi-fuente recientes_');
      } else {
        for (const cl of clusters) {
          const title = String(cl.primary_title || '').slice(0, 90);
          lines.push(`  • [${cl.source_count}🔗] ${escMd(title)}`);
        }
      }

      lines.push('');
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ /world error: ${err.message}`);
    }
  });

  // ─── P4: Impuestos (tax deadlines) ─────────────────
  bot.onText(/\/impuestos/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT country, name, description, deadline, notes,
          (deadline - CURRENT_DATE) AS days_remaining
         FROM bur_tax_deadlines
         WHERE is_active = TRUE AND deadline >= CURRENT_DATE
         ORDER BY deadline ASC LIMIT 10`
      );
      if (!rows.length) {
        send(msg.chat.id, '✅ Sin deadlines fiscales próximos.');
        return;
      }
      const flag = (c) => ({ NZ: '🇳🇿', ES: '🇪🇸', AU: '🇦🇺', EU: '🇪🇺', DZ: '🇩🇿' }[c] || '🏛️');
      const urg = (d) => (d <= 7 ? '🔴' : d <= 30 ? '🟡' : '🟢');
      const lines = ['💼 *Próximos deadlines fiscales*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        const date = new Date(r.deadline).toISOString().split('T')[0];
        lines.push(`${urg(r.days_remaining)} ${flag(r.country)} *${r.name}*`);
        lines.push(`   📅 ${date} — *${r.days_remaining} días*`);
        if (r.description) lines.push(`   📝 ${r.description}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P4: Vacunaciones ──────────────────────────────
  bot.onText(/\/vacunas/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT vaccine, dose_number, date_given, expiry_date, country, notes,
          CASE WHEN expiry_date IS NULL THEN NULL
               ELSE (expiry_date - CURRENT_DATE) END AS days_remaining
         FROM bur_vaccinations
         ORDER BY date_given DESC LIMIT 15`
      );
      if (!rows.length) {
        send(msg.chat.id, '💉 Sin vacunaciones registradas.');
        return;
      }
      const flag = (c) => ({ NZ: '🇳🇿', ES: '🇪🇸', AU: '🇦🇺', EU: '🇪🇺', DZ: '🇩🇿' }[c] || '');
      const lines = ['💉 *Vacunaciones registradas*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const v of rows) {
        const given = new Date(v.date_given).toISOString().split('T')[0];
        const dose = v.dose_number ? ` (dosis ${v.dose_number})` : '';
        lines.push(`💉 *${v.vaccine}*${dose} ${flag(v.country)}`);
        lines.push(`   📅 Aplicada: ${given}`);
        if (v.expiry_date) {
          const exp = new Date(v.expiry_date).toISOString().split('T')[0];
          const urgent = v.days_remaining <= 30 ? '⚠️' : '✅';
          lines.push(`   ${urgent} Caduca: ${exp} (${v.days_remaining} días)`);
        }
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 R4: Macros calculator ──────────────────────
  // Uso: /macros 78 178 32 male moderate maintain
  //   weight_kg height_cm age sex activity goal
  bot.onText(/\/macros(?:\s+(\d+(?:\.\d+)?))?(?:\s+(\d+(?:\.\d+)?))?(?:\s+(\d+))?(?:\s+(male|female))?(?:\s+(\w+))?(?:\s+(cut|maintain|bulk))?/,
    async (msg, match) => {
      try {
        const bc = require('./bio_calc');
        const r = bc.computeMacros({
          weight_kg: parseFloat(match[1]) || 75,
          height_cm: parseFloat(match[2]) || 175,
          age: parseInt(match[3]) || 32,
          sex: match[4] || 'male',
          activity: match[5] || 'moderate',
          goal: match[6] || 'maintain',
        });
        if (r.error) { send(msg.chat.id, `❌ ${r.error}`); return; }
        const lines = [
          `🍎 *Macros — ${r.goal}* (${r.activity_level})`,
          '━━━━━━━━━━━━━━━━━━━━━━━━',
          `BMR: ${r.bmr_kcal} kcal · TDEE: ${r.tdee_kcal} kcal`,
          `🎯 Target: *${r.target_kcal} kcal*`,
          '',
          `🥩 Protein: *${r.macros.protein_g}g* (${r.macro_split_pct.protein}%)`,
          `🍞 Carbs:   *${r.macros.carbs_g}g* (${r.macro_split_pct.carbs}%)`,
          `🥑 Fat:     *${r.macros.fat_g}g* (${r.macro_split_pct.fat}%)`,
          '',
          `_Uso: /macros 78 178 32 male moderate maintain_`,
        ];
        send(msg.chat.id, lines.join('\n'), 'Markdown');
      } catch (err) { send(msg.chat.id, `❌ ${err.message}`); }
    });

  // ─── P7 R4: Sleep score ────────────────────────────
  bot.onText(/\/sueno|\/sleepscore/, async (msg) => {
    try {
      const bc = require('./bio_calc');
      const r = await bc.computeSleepScore({});
      if (r.error) { send(msg.chat.id, `😴 ${r.error}`); return; }
      const emoji = r.score >= 85 ? '🌟' : r.score >= 70 ? '✅' : r.score >= 55 ? '🟡' : r.score >= 40 ? '🟠' : '🔴';
      const lines = [
        `${emoji} *Sleep score:* ${r.score}/100 — _${r.label}_`,
        `📅 ${r.date}`,
        '',
        '*Componentes:*',
      ];
      for (const [k, v] of Object.entries(r.components)) {
        const baseline = v.baseline ? ` (baseline ${v.baseline})` : '';
        lines.push(`  • ${k}: ${v.value}${baseline} → ${v.score}/100 (peso ${v.weight}%)`);
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) { send(msg.chat.id, `❌ ${err.message}`); }
  });

  // ─── P4 R4: Apostilles ─────────────────────────────
  bot.onText(/\/apostillas/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT document_name, document_type, country_origin, expiry_date, apostille_number,
                CASE WHEN expiry_date IS NULL THEN NULL
                     ELSE (expiry_date - CURRENT_DATE) END AS days_remaining
         FROM bur_apostilles
         WHERE is_active = TRUE
         ORDER BY expiry_date ASC NULLS LAST LIMIT 15`
      );
      if (!rows.length) { send(msg.chat.id, '📜 Sin apostillas registradas. Usa POST /api/bureaucracy/apostilles'); return; }
      const flag = (c) => ({ NZ: '🇳🇿', ES: '🇪🇸', AU: '🇦🇺', DZ: '🇩🇿', FR: '🇫🇷', GB: '🇬🇧' }[c] || '🌐');
      const lines = ['📜 *Apostillas registradas*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        lines.push(`${flag(r.country_origin)} *${r.document_name}*${r.document_type ? ` (${r.document_type})` : ''}`);
        if (r.expiry_date) {
          const exp = new Date(r.expiry_date).toISOString().split('T')[0];
          const urg = r.days_remaining <= 30 ? '🔴' : r.days_remaining <= 90 ? '🟡' : '🟢';
          lines.push(`   ${urg} Caduca: ${exp} (${r.days_remaining} días)`);
        }
        if (r.apostille_number) lines.push(`   🔢 ${r.apostille_number}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) { send(msg.chat.id, `❌ Error: ${err.message}`); }
  });

  // ─── P4 R4: Driver licenses ────────────────────────
  bot.onText(/\/licencias/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT country, license_number, expiry_date, classes,
                (expiry_date - CURRENT_DATE) AS days_remaining
         FROM bur_driver_licenses
         WHERE is_active = TRUE
         ORDER BY expiry_date ASC LIMIT 10`
      );
      if (!rows.length) { send(msg.chat.id, '🚗 Sin licencias de conducir registradas.'); return; }
      const flag = (c) => ({ NZ: '🇳🇿', ES: '🇪🇸', AU: '🇦🇺', DZ: '🇩🇿', FR: '🇫🇷', GB: '🇬🇧' }[c] || '🌐');
      const lines = ['🚗 *Licencias de conducir*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        const exp = new Date(r.expiry_date).toISOString().split('T')[0];
        const urg = r.days_remaining <= 30 ? '🔴' : r.days_remaining <= 90 ? '🟡' : '🟢';
        lines.push(`${flag(r.country)} ${r.license_number || '(sin número)'}`);
        if (r.classes && r.classes.length) lines.push(`   Clases: ${r.classes.join(', ')}`);
        lines.push(`   ${urg} Caduca: ${exp} (${r.days_remaining} días)`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) { send(msg.chat.id, `❌ Error: ${err.message}`); }
  });

  // ─── P4 R4: Military obligations (DZ) ──────────────
  bot.onText(/\/militar/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT country, obligation_type, status, document_number, expiry_date,
                CASE WHEN expiry_date IS NULL THEN NULL
                     ELSE (expiry_date - CURRENT_DATE) END AS days_remaining
         FROM bur_military_obligations
         ORDER BY expiry_date ASC NULLS LAST LIMIT 10`
      );
      if (!rows.length) { send(msg.chat.id, '🎖️ Sin obligaciones militares registradas.'); return; }
      const flag = (c) => ({ DZ: '🇩🇿', ES: '🇪🇸', FR: '🇫🇷' }[c] || '🌐');
      const lines = ['🎖️ *Obligaciones militares*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        lines.push(`${flag(r.country)} *${r.obligation_type || '?'}* — ${r.status || 'sin estado'}`);
        if (r.document_number) lines.push(`   📄 ${r.document_number}`);
        if (r.expiry_date) {
          const exp = new Date(r.expiry_date).toISOString().split('T')[0];
          const urg = r.days_remaining <= 30 ? '🔴' : r.days_remaining <= 90 ? '🟡' : '🟢';
          lines.push(`   ${urg} Caduca: ${exp} (${r.days_remaining} días)`);
        }
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) { send(msg.chat.id, `❌ Error: ${err.message}`); }
  });

  // ─── P4 Fase 2: Schengen 90/180 calculator ─────────
  bot.onText(/\/schengen(?:\s+(\d{4}-\d{2}-\d{2}))?/, async (msg, match) => {
    try {
      const schengen = require('./schengen');
      const targetDate = match[1] ? new Date(match[1]) : new Date();
      const status = await schengen.getSchengenStatus(targetDate);

      const lines = [
        '🛂 *Schengen 90/180 calculator*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📅 Fecha objetivo: ${status.target_date}`,
        `🪟 Ventana 180d: ${status.window_start} → ${status.window_end}`,
        '',
        `📊 Días usados: *${status.days_used}* / 90`,
        `✅ Días restantes: *${status.days_remaining}*`,
      ];

      if (status.overstay) {
        lines.push('🚨 *OVERSTAY* — superas el límite de 90 días');
      }

      if (status.breakdown.length) {
        lines.push('', '📋 _Estancias en ventana:_');
        for (const b of status.breakdown) {
          lines.push(`  ${b.country} ${b.entry}→${b.exit || 'ongoing'} (${b.days_in_window}d)`);
        }
      } else {
        lines.push('', '📭 Sin estancias Schengen registradas en la ventana');
      }

      if (status.next_full_90_window) {
        const nw = status.next_full_90_window;
        lines.push('', `🎯 Próximo stay 90d completo: *${nw.earliest_date}* (en ${nw.days_until} días)`);
      }

      lines.push('', `_Total trips logged: ${status.total_trips_logged}_`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P4 Fase 2: Visa matrix lookup ─────────────────
  // /visa ES NZ  → requirement ES → NZ
  // /visa ES     → lista todos los destinos del pasaporte ES
  bot.onText(/\/visa(?:\s+([a-zA-Z]{2}))?(?:\s+([a-zA-Z]{2}))?/, async (msg, match) => {
    try {
      const from = match[1];
      const to = match[2];
      if (!from) {
        send(msg.chat.id, '❌ Uso: `/visa ES NZ` o `/visa ES` (lista completa)', 'Markdown');
        return;
      }
      const reqEmoji = (r) => ({
        'freedom of movement': '🟢🟢',
        'visa free': '🟢',
        'visa on arrival': '🟡',
        'eta': '🟡',
        'e-visa': '🟠',
        'visa required': '🔴',
        'no admission': '⛔',
      }[r] || '⚪');

      if (to) {
        const row = await db.queryOne(
          `SELECT * FROM bur_visa_matrix WHERE passport=$1 AND destination=$2`,
          [from.toUpperCase(), to.toUpperCase()]
        );
        if (!row) {
          send(msg.chat.id, `❌ Sin datos ${from.toUpperCase()}→${to.toUpperCase()}. Datos: ES, DZ`);
          return;
        }
        const lines = [
          `🛂 *${row.passport} → ${row.destination}*`,
          '━━━━━━━━━━━━━━━━━━━━━━━━',
          `${reqEmoji(row.requirement)} *${row.requirement}*`,
        ];
        if (row.days_allowed) lines.push(`📅 Días permitidos: *${row.days_allowed}*`);
        if (row.notes) lines.push(`📝 ${row.notes}`);
        send(msg.chat.id, lines.join('\n'), 'Markdown');
        return;
      }

      // Lista completa
      const rows = await db.queryAll(
        `SELECT destination, requirement, days_allowed FROM bur_visa_matrix
         WHERE passport=$1 ORDER BY requirement, destination`,
        [from.toUpperCase()]
      );
      if (!rows.length) {
        send(msg.chat.id, `❌ Sin datos para passport ${from.toUpperCase()}`);
        return;
      }
      const groups = {};
      for (const r of rows) {
        if (!groups[r.requirement]) groups[r.requirement] = [];
        groups[r.requirement].push(r.destination + (r.days_allowed ? `(${r.days_allowed}d)` : ''));
      }
      const lines = [`🛂 *Pasaporte ${from.toUpperCase()}* — ${rows.length} destinos`, '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const [req, dests] of Object.entries(groups)) {
        lines.push(`${reqEmoji(req)} _${req}_ (${dests.length})`);
        lines.push(`   ${dests.join(', ')}`);
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P4 Fase 2: Log de viajes ──────────────────────
  // /viaje DZ 2026-05-01 FR  → entry DZ passport, fecha, país
  // /viaje DZ 2026-05-01 FR 2026-05-15  → con exit
  bot.onText(/\/viaje\s+([a-zA-Z]{2})\s+(\d{4}-\d{2}-\d{2})\s+([a-zA-Z]{2})(?:\s+(\d{4}-\d{2}-\d{2}))?/, async (msg, match) => {
    try {
      const passport = match[1].toUpperCase();
      const entry = match[2];
      const country = match[3].toUpperCase();
      const exit = match[4] || null;

      const schengen = require('./schengen');
      const area = schengen.SCHENGEN_COUNTRIES.has(country) ? 'SCHENGEN' : null;

      const row = await db.queryOne(
        `INSERT INTO bur_travel_log (country, area, entry_date, exit_date, passport_used, source)
         VALUES ($1,$2,$3,$4,$5,'telegram') RETURNING *`,
        [country, area, entry, exit, passport]
      );
      const days = exit
        ? Math.round((new Date(exit) - new Date(entry)) / 86400000) + 1
        : null;
      send(
        msg.chat.id,
        `✅ Viaje registrado #${row.id}\n` +
        `${passport}→${country} ${area ? '🇪🇺 SCHENGEN' : ''}\n` +
        `📅 ${entry}${exit ? ' → ' + exit : ' (ongoing)'}${days ? ` (${days}d)` : ''}\n\n` +
        `Usa /schengen para ver días disponibles`,
      );
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 Fase 3d: Healthcare system lookup ─────────
  bot.onText(/\/sanidad\s+([a-zA-Z]{2})/, async (msg, match) => {
    try {
      const row = await db.queryOne(
        `SELECT * FROM bio_healthcare_systems WHERE country = $1`,
        [match[1].toUpperCase()]
      );
      if (!row) {
        send(msg.chat.id, `❌ Sin datos para ${match[1].toUpperCase()}. Disponibles: NZ AU ES FR GB US CA DZ MA JP`);
        return;
      }
      const flag = ({ NZ:'🇳🇿', AU:'🇦🇺', ES:'🇪🇸', FR:'🇫🇷', GB:'🇬🇧', US:'🇺🇸', CA:'🇨🇦', DZ:'🇩🇿', MA:'🇲🇦', JP:'🇯🇵' })[row.country] || '🌐';
      const lines = [
        `${flag} *${row.system_name}*`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `🏥 Tipo: _${row.type}_`,
        `🚨 Emergency: *${row.emergency_no}*`,
        '',
        `*Eligibility:*`,
        `${row.eligibility}`,
        '',
        `*Coste residente:*`,
        `${row.cost_resident}`,
        '',
        `*Coste visitante:*`,
        `${row.cost_visitor}`,
      ];
      if (row.notes) lines.push('', `📝 _${row.notes}_`);
      lines.push('', `🔗 ${row.apply_url}`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 Fase 3c: Therapy directory ─────────────────
  bot.onText(/\/terapia(?:\s+([a-zA-Z]{2}))?/, async (msg, match) => {
    try {
      const where = [];
      const params = [];
      if (match[1]) { params.push(match[1].toUpperCase()); where.push(`country=$${params.length}`); }
      const rows = await db.queryAll(
        `SELECT country, city, name, type, modality, rate_min, rate_max, currency, free_options, url, phone, notes
         FROM bio_therapy_directory
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY country, free_options DESC LIMIT 12`,
        params
      );
      if (!rows.length) {
        send(msg.chat.id, `❌ Sin providers para ${match[1] || '?'}`);
        return;
      }
      const flag = (c) => ({ ES: '🇪🇸', NZ: '🇳🇿', AU: '🇦🇺', FR: '🇫🇷', GB: '🇬🇧', US: '🇺🇸', DZ: '🇩🇿' }[c] || '🌐');
      const typeEmoji = { platform: '💻', clinic: '🏥', individual: '👤', hotline: '📞' };
      const lines = ['🧠 *Therapy directory*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        const free = r.free_options ? '🆓 ' : '';
        const rate = r.rate_min ? `${r.currency} ${r.rate_min}-${r.rate_max || '?'}` : (r.free_options ? 'FREE' : '?');
        lines.push(`${flag(r.country)} ${typeEmoji[r.type] || '?'} ${free}*${r.name}*${r.city ? ' (' + r.city + ')' : ''}`);
        lines.push(`  💰 ${rate} · 📡 ${(r.modality || []).join('/')}`);
        if (r.phone) lines.push(`  📞 ${r.phone}`);
        if (r.notes) lines.push(`  _${r.notes.slice(0, 100)}_`);
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 Fase 3b: Mood tracking ─────────────────────
  bot.onText(/\/mood\s+(\d+)(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+(.+))?/, async (msg, match) => {
    try {
      const mood = parseInt(match[1], 10);
      const energy = match[2] ? parseInt(match[2], 10) : null;
      const anxiety = match[3] ? parseInt(match[3], 10) : null;
      const notes = match[4] || null;
      if (mood < 1 || mood > 10) {
        send(msg.chat.id, '❌ mood debe ser 1-10');
        return;
      }
      await db.query(
        `INSERT INTO bio_mood (mood, energy, anxiety, notes) VALUES ($1,$2,$3,$4)`,
        [mood, energy, anxiety, notes]
      );
      const emoji = mood <= 3 ? '😢' : mood <= 5 ? '😐' : mood <= 7 ? '🙂' : '😄';
      let reply = `${emoji} Mood ${mood}/10 registrado`;
      if (energy) reply += ` · ⚡ ${energy}/10`;
      if (anxiety) reply += ` · 😰 ${anxiety}/10`;
      // Avg últimos 7d
      const avg = await db.queryOne(
        `SELECT ROUND(AVG(mood)::numeric, 1) as avg7
         FROM bio_mood WHERE logged_at >= NOW() - INTERVAL '7 days'`
      );
      if (avg?.avg7) reply += `\n📊 Avg 7d: ${avg.avg7}/10`;
      send(msg.chat.id, reply);
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 Fase 3b: CBT prompt random ─────────────────
  bot.onText(/\/cbt(?:\s+(\w+))?/, async (msg, match) => {
    try {
      const where = match[1] ? 'WHERE category=$1' : '';
      const params = match[1] ? [match[1]] : [];
      const row = await db.queryOne(
        `SELECT id, category, technique, prompt FROM bio_cbt_prompts ${where} ORDER BY RANDOM() LIMIT 1`,
        params
      );
      if (!row) {
        send(msg.chat.id, '❌ No prompts disponibles');
        return;
      }
      send(
        msg.chat.id,
        `🧠 *${row.technique}* — _${row.category}_\n\n${row.prompt}\n\n_Para responder: /diario (POST /api/bio/journal con cbt_prompt_id=${row.id})_`,
        'Markdown'
      );
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/diario/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT id, logged_at, title, LEFT(body_md, 200) as preview
         FROM bio_journal ORDER BY logged_at DESC LIMIT 5`
      );
      if (!rows.length) {
        send(msg.chat.id, '📓 Sin entradas en journal todavía.\nCrea una: POST /api/bio/journal { body_md, title?, cbt_prompt_id? }');
        return;
      }
      const lines = ['📓 *Últimas entradas journal*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        const dt = new Date(r.logged_at).toISOString().slice(0, 10);
        lines.push(`📅 ${dt} — *${r.title || 'sin título'}*`);
        lines.push(`  _${r.preview.replace(/[*_]/g, '')}_`);
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 Fase 3a: Wger exercise search ──────────────
  bot.onText(/\/ejercicio\s+(.+)/, async (msg, match) => {
    try {
      const wger = require('./wger');
      const results = await wger.searchExercises({ q: match[1].trim(), limit: 8 });
      if (!results.length) {
        send(msg.chat.id, `❌ Sin resultados para "${match[1]}"`);
        return;
      }
      const lines = [`💪 *Ejercicios — "${match[1]}"*`, '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const e of results) {
        lines.push(`• *${e.name}* _(${e.category || '?'})_`);
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 Fase 3a: OFF barcode lookup ────────────────
  bot.onText(/\/comida\s+(\d{8,14})/, async (msg, match) => {
    try {
      const off = require('./openfoodfacts');
      const r = await off.lookupBarcode(match[1]);
      if (!r.ok) {
        send(msg.chat.id, `❌ Producto no encontrado (${match[1]})`);
        return;
      }
      const p = r.product;
      const n = p.nutriments_per_100g;
      const lines = [
        `🍽️ *${p.name}*`,
        `🏷️ ${p.brand || '?'}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `*Nutrition per 100g:*`,
        `🔥 ${n.kcal || '?'} kcal`,
        `🥩 ${n.protein_g || '?'} g protein`,
        `🍞 ${n.carbs_g || '?'} g carbs (sugar ${n.sugar_g || '?'} g)`,
        `🧈 ${n.fat_g || '?'} g fat (sat ${n.sat_fat_g || '?'} g)`,
        `🌾 ${n.fiber_g || '?'} g fiber`,
        `🧂 ${n.salt_g || '?'} g salt`,
      ];
      if (p.nutriscore) lines.push(`📊 Nutri-Score: *${p.nutriscore.toUpperCase()}*`);
      if (p.nova_group) lines.push(`🏭 NOVA group: ${p.nova_group}`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P6 Fase 2: Routing OSRM ───────────────────────
  bot.onText(/\/ruta\s+(-?\d+\.?\d*),(-?\d+\.?\d*)\s+(-?\d+\.?\d*),(-?\d+\.?\d*)/, async (msg, match) => {
    try {
      const routing = require('./routing');
      const from = { lat: parseFloat(match[1]), lon: parseFloat(match[2]) };
      const to = { lat: parseFloat(match[3]), lon: parseFloat(match[4]) };
      const r = await routing.routeOSRM(from, to, 'driving');
      const lines = [
        '🛣️ *Route computed*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📍 ${from.lat.toFixed(4)},${from.lon.toFixed(4)}`,
        `📍 ${to.lat.toFixed(4)},${to.lon.toFixed(4)}`,
        '',
        `📏 Distancia: *${r.distance_km} km*`,
        `⏱️ Duración: *${Math.floor(r.duration_min / 60)}h ${r.duration_min % 60}min*`,
        `⚙️ Provider: ${r.provider}`,
      ];
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P6 Fase 2: GPS tracking ───────────────────────
  bot.onText(/\/gps/, async (msg) => {
    try {
      const traccar = require('./traccar');
      const reachable = await traccar.isReachable();
      const last = await traccar.getLastPosition();
      const lines = ['📍 *GPS Tracking*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      lines.push(`Traccar server: ${reachable ? '✅ reachable' : '❌ no reachable'}`);
      if (last) {
        const fixDate = new Date(last.fix_time).toISOString().replace('T', ' ').slice(0, 16);
        lines.push('', `*Última posición:*`);
        lines.push(`📍 ${parseFloat(last.lat).toFixed(5)}, ${parseFloat(last.lon).toFixed(5)}`);
        lines.push(`📅 ${fixDate} UTC`);
        if (last.speed_kmh) lines.push(`🚐 ${parseFloat(last.speed_kmh).toFixed(1)} km/h`);
        if (last.altitude) lines.push(`⛰️ ${parseFloat(last.altitude).toFixed(0)}m alt`);
        lines.push(`📱 device: ${last.device_id}`);
        const mapUrl = `https://www.openstreetmap.org/?mlat=${last.lat}&mlon=${last.lon}#map=15/${last.lat}/${last.lon}`;
        lines.push('', `🗺️ [Ver en mapa](${mapUrl})`);
      } else {
        lines.push('', '📭 Sin posiciones registradas todavía');
        lines.push('', '_Setup: instalar Traccar Client iOS/Android, apuntar a `95.217.158.7:5055` (OsmAnd protocol). O usar webhook directo: `/webhooks/gps?id=phone&lat=X&lon=Y`_');
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7 Fase 2: Health check destino (outbreaks + vacunas) ──
  bot.onText(/\/destino\s+([a-zA-Z]{2})/, async (msg, match) => {
    try {
      const healthCheck = require('./health_destination_check');
      const country = match[1].toUpperCase();
      const r = await healthCheck.checkDestination(country);
      if (!r) {
        send(msg.chat.id, '❌ Sin datos para ese país');
        return;
      }
      const riskEmoji = { low: '🟢', medium: '🟡', high: '🟠', critical: '🔴' }[r.risk_level] || '⚪';
      const lines = [
        `🌐 *Destination check — ${r.country}*`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `${riskEmoji} Risk level: *${r.risk_level.toUpperCase()}*`,
        '',
      ];
      if (r.vaccinations_recommended.length > 0) {
        lines.push(`💉 *Vacunas recomendadas (${r.vaccinations_recommended.length}):*`);
        for (const v of r.vaccinations_recommended) {
          const missing = r.vaccinations_missing.includes(v);
          lines.push(`  ${missing ? '❌' : '✅'} ${v}`);
        }
      } else {
        lines.push('💉 Sin vacunas especiales recomendadas');
      }
      lines.push('');
      if (r.events.length > 0) {
        lines.push(`🦠 *Outbreaks recientes (${r.events.length}):*`);
        for (const e of r.events.slice(0, 5)) {
          const dt = new Date(e.occurred_at).toISOString().slice(0, 10);
          lines.push(`  [${e.severity}] ${dt} — ${(e.title || '').slice(0, 70)}`);
        }
      } else {
        lines.push('✅ Sin outbreaks registrados (últimos 60d)');
      }
      lines.push('');
      lines.push(`📰 Health alerts WHO/CDC/ECDC últimos 30d: ${r.health_alerts.length}`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P1 Fase 2: Early warning events ───────────────
  bot.onText(/\/events(?:\s+([a-zA-Z]{2}))?/, async (msg, match) => {
    try {
      const country = match[1] ? match[1].toUpperCase() : null;
      const params = [];
      let where = 'WHERE occurred_at >= NOW() - INTERVAL \'7 days\'';
      if (country) {
        params.push(country);
        where += ` AND country = $${params.length}`;
      }
      const rows = await db.queryAll(
        `SELECT source, event_type, severity, title, country, magnitude, occurred_at
         FROM events_store ${where}
         ORDER BY severity = 'critical' DESC, severity = 'high' DESC, occurred_at DESC LIMIT 15`,
        params
      );
      if (!rows.length) {
        send(msg.chat.id, `🌐 Sin eventos en últimos 7d${country ? ' para ' + country : ''}.`);
        return;
      }
      const sevEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
      const srcEmoji = { usgs: '🌍', who_dons: '🦠', acled: '⚔️', gdelt_cast: '📰' };
      const lines = [`🌐 *Early Warning Events${country ? ' — ' + country : ''}*`, '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const e of rows) {
        const dt = new Date(e.occurred_at).toISOString().slice(0, 16).replace('T', ' ');
        const mag = e.magnitude ? ` M${parseFloat(e.magnitude).toFixed(1)}` : '';
        lines.push(`${sevEmoji[e.severity] || '⚪'} ${srcEmoji[e.source] || '?'} ${dt}${mag}`);
        lines.push(`   ${(e.title || '').slice(0, 80)}`);
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3 Fase 3b: Portfolio (stocks/ETFs Stooq) ─────
  bot.onText(/\/portfolio/, async (msg) => {
    try {
      const inv = require('./investments');
      const p = await inv.getPortfolio();
      if (!p.positions.length) {
        send(msg.chat.id, '📈 Sin investments.\nAñade: POST /api/finances/investments {symbol,quantity,avg_cost,currency}');
        return;
      }
      const arrow = p.return_pct >= 0 ? '📈' : '📉';
      const lines = ['📈 *Portfolio*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const pos of p.positions.slice(0, 12)) {
        const pnlEmoji = pos.pnl_pct >= 0 ? '🟢' : '🔴';
        lines.push(`*${pos.symbol}* ${pos.quantity} @ ${pos.current_price}`);
        lines.push(`  💰 NZD ${pos.value_nzd.toFixed(0)} ${pnlEmoji} ${pos.pnl_pct >= 0 ? '+' : ''}${pos.pnl_pct.toFixed(1)}%`);
      }
      lines.push('');
      lines.push(`📊 *Total: NZD ${p.total_value_nzd.toFixed(0)}*`);
      lines.push(`${arrow} Cost basis: NZD ${p.total_cost_nzd.toFixed(0)} (${p.return_pct >= 0 ? '+' : ''}${p.return_pct}%)`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3 Fase 2: Crypto holdings ────────────────────
  bot.onText(/\/crypto/, async (msg) => {
    try {
      const crypto = require('./crypto');
      const result = await crypto.getHoldings();
      if (!result.holdings.length) {
        send(msg.chat.id, '🪙 No hay crypto holdings.\nAñade: POST /api/finances/crypto {symbol,amount,exchange}\nO sync Binance: POST /api/finances/crypto/sync-binance');
        return;
      }
      const lines = ['🪙 *Crypto Holdings*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const h of result.holdings.slice(0, 12)) {
        const pct = result.total_nzd ? (h.value_nzd / result.total_nzd * 100) : 0;
        lines.push(`*${h.symbol}* — ${h.amount.toFixed(4)} @ $${h.price_nzd.toFixed(2)}`);
        lines.push(`   💰 NZD ${h.value_nzd.toFixed(2)} (${pct.toFixed(1)}%) · _${h.exchange}_`);
      }
      lines.push('', `📊 *Total: NZD ${result.total_nzd.toFixed(2)}*`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3 Fase 2: Recurring expenses detectados ─────
  bot.onText(/\/recurring/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT payee_normalized, frequency, amount_avg, currency, next_expected,
                confidence, sample_size,
                (next_expected - CURRENT_DATE) AS days_until
         FROM fin_recurring
         WHERE confidence >= 0.5
         ORDER BY confidence DESC, amount_avg DESC LIMIT 15`
      );
      if (!rows.length) {
        send(msg.chat.id, '🔁 No hay gastos recurrentes detectados.\nUsa POST /api/finances/recurring/detect para escanear.');
        return;
      }
      const lines = ['🔁 *Gastos recurrentes detectados*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        const conf = Math.round(parseFloat(r.confidence) * 100);
        const due = r.days_until >= 0 ? `en ${r.days_until}d` : `${-r.days_until}d atrasado`;
        lines.push(`💳 *${r.payee_normalized}* (${r.frequency})`);
        lines.push(`   ${r.currency} ${parseFloat(r.amount_avg).toFixed(2)} · conf ${conf}% · n=${r.sample_size}`);
        lines.push(`   📅 next: ${r.next_expected} (${due})`);
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3 Fase 2: Savings goals ──────────────────────
  bot.onText(/\/savings/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT name, target_amount, current_amount, currency, target_date, category,
                CASE WHEN target_amount > 0 THEN ROUND((current_amount/target_amount*100)::numeric,1)
                     ELSE 0 END AS pct,
                CASE WHEN target_date IS NULL THEN NULL
                     ELSE (target_date - CURRENT_DATE) END AS days_remaining
         FROM fin_savings_goals
         WHERE is_active=TRUE
         ORDER BY target_date NULLS LAST`
      );
      if (!rows.length) {
        send(msg.chat.id, '🎯 No hay savings goals.\nCrea uno: POST /api/finances/savings-goals { name, target_amount }');
        return;
      }
      const lines = ['🎯 *Savings Goals*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const g of rows) {
        const pct = parseFloat(g.pct);
        const filled = Math.min(10, Math.floor(pct / 10));
        const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
        lines.push(`*${g.name}* ${g.category ? '_(' + g.category + ')_' : ''}`);
        lines.push(`  ${bar} ${pct}%`);
        lines.push(`  ${g.currency} ${parseFloat(g.current_amount).toFixed(0)} / ${parseFloat(g.target_amount).toFixed(0)}`);
        if (g.target_date) {
          const dr = g.days_remaining;
          const urg = dr < 0 ? '🔴 vencido' : dr < 30 ? '🟡' : '🟢';
          lines.push(`  📅 ${g.target_date} ${urg} ${dr}d`);
        }
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3 Fase 2: Net worth timeline ─────────────────
  bot.onText(/\/nw/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT date, total_nzd FROM fin_net_worth_snapshots
         WHERE date >= CURRENT_DATE - INTERVAL '90 days'
         ORDER BY date ASC`
      );
      if (!rows.length) {
        send(msg.chat.id, '📈 Sin snapshots de net worth todavía.\nEl cron diario 23:55 los crea.');
        return;
      }
      const first = parseFloat(rows[0].total_nzd);
      const last = parseFloat(rows[rows.length - 1].total_nzd);
      const delta = last - first;
      const pct = first ? (delta / first * 100) : 0;
      const arrow = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
      const lines = [
        '📊 *Net Worth Timeline (90d)*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `Snapshots: ${rows.length}`,
        `${rows[0].date} → ${rows[rows.length - 1].date}`,
        '',
        `${arrow} NZD ${first.toFixed(0)} → *${last.toFixed(0)}*`,
        `Δ ${delta >= 0 ? '+' : ''}${delta.toFixed(0)} NZD (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%)`,
        '',
      ];
      // Sparkline rough: últimos 14 valores
      const recent = rows.slice(-14);
      if (recent.length >= 2) {
        const vals = recent.map(r => parseFloat(r.total_nzd));
        const min = Math.min(...vals), max = Math.max(...vals);
        const range = max - min || 1;
        const blocks = '▁▂▃▄▅▆▇█';
        const spark = vals.map(v => blocks[Math.floor((v - min) / range * 7)]).join('');
        lines.push(`14d: ${spark}`);
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P4 Fase 2: Paperless-ngx status + recientes ──
  bot.onText(/\/paperless/, async (msg) => {
    try {
      const paperless = require('./paperless');
      const reachable = await paperless.isReachable();
      if (!reachable) {
        send(msg.chat.id, '📂 Paperless-ngx: ❌ no reachable\nVerifica container ultra_paperless.');
        return;
      }
      const stats = await paperless.getStats().catch(() => null);
      const list = await paperless.listDocuments({ page: 1 }).catch(() => null);

      const lines = ['📂 *Paperless-ngx*', '━━━━━━━━━━━━━━━━━━━━━━━━', '✅ reachable'];
      if (stats) {
        lines.push(`📄 Total docs: ${stats.documents_total ?? '?'}`);
        if (stats.documents_inbox !== undefined) lines.push(`📥 Inbox: ${stats.documents_inbox}`);
        if (stats.character_count !== undefined) lines.push(`🔤 Chars OCR: ${stats.character_count.toLocaleString()}`);
      }

      // Cuenta links activos en bur tablas
      const linked = await db.queryOne(
        `SELECT
          (SELECT COUNT(*) FROM document_alerts WHERE paperless_id IS NOT NULL) AS docs,
          (SELECT COUNT(*) FROM bur_vaccinations WHERE paperless_id IS NOT NULL) AS vacs,
          (SELECT COUNT(*) FROM health_documents WHERE paperless_id IS NOT NULL) AS health`
      );
      lines.push('', `🔗 *Links activos:* docs=${linked.docs} vacunas=${linked.vacs} health=${linked.health}`);

      if (list && list.results && list.results.length) {
        lines.push('', '📋 _Últimos 5 documentos:_');
        for (const d of list.results.slice(0, 5)) {
          const date = (d.created || '').split('T')[0];
          lines.push(`  📄 ${date} — ${(d.title || 'untitled').slice(0, 60)}`);
        }
      }
      lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error paperless: ${err.message}`);
    }
  });

  // ─── P4 Fase 3b: Embassy lookup ────────────────────
  bot.onText(/\/embajada(?:\s+([a-zA-Z]{2}))?(?:\s+([a-zA-Z]{2}))?/, async (msg, match) => {
    try {
      const where = [];
      const params = [];
      if (match[1]) { params.push(match[1].toUpperCase()); where.push(`representing=$${params.length}`); }
      if (match[2]) { params.push(match[2].toUpperCase()); where.push(`located_in=$${params.length}`); }
      const rows = await db.queryAll(
        `SELECT representing, located_in, type, city, address, phone, email, url, notes
         FROM bur_embassies ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY representing, located_in, city LIMIT 10`,
        params
      );
      if (!rows.length) {
        send(msg.chat.id, `❌ No hay embajadas para esos parámetros.\nUso: \`/embajada ES NZ\` o \`/embajada DZ\``, 'Markdown');
        return;
      }
      const flag = (c) => ({ ES: '🇪🇸', DZ: '🇩🇿', NZ: '🇳🇿', AU: '🇦🇺', FR: '🇫🇷', GB: '🇬🇧', CA: '🇨🇦' }[c] || '🌐');
      const lines = ['🏛️ *Embajadas y consulados*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const e of rows) {
        const typeEmoji = e.type === 'embassy' ? '🏛️' : e.type === 'consulate' ? '📋' : '⭐';
        lines.push(`${typeEmoji} ${flag(e.representing)} *${e.representing}* en ${flag(e.located_in)} ${e.located_in} — _${e.city}_`);
        if (e.address) lines.push(`  📍 ${e.address}`);
        if (e.phone) lines.push(`  📞 ${e.phone}`);
        if (e.email) lines.push(`  ✉️ ${e.email}`);
        if (e.notes) lines.push(`  📝 _${e.notes}_`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P4 Fase 2: Gov watches (changedetection.io) ─────
  bot.onText(/\/govwatch/, async (msg) => {
    try {
      const watches = await db.queryAll(
        `SELECT id, label, country, category, cdio_uuid, last_changed_at,
          (CURRENT_TIMESTAMP - last_changed_at) AS age
         FROM bur_gov_watches WHERE is_active=TRUE
         ORDER BY (last_changed_at IS NULL), last_changed_at DESC NULLS LAST, country`
      );
      const changes = await db.queryAll(
        `SELECT c.detected_at, c.diff_summary, w.label, w.country
         FROM bur_gov_changes c
         LEFT JOIN bur_gov_watches w ON c.watch_id = w.id
         ORDER BY c.detected_at DESC LIMIT 5`
      );
      const flag = (c) => ({ NZ: '🇳🇿', AU: '🇦🇺', ES: '🇪🇸', DZ: '🇩🇿' }[c]) || '🌐';
      const cat = (c) => ({ visa: '🛂', tax: '💰', consular: '🏛️', other: '📄' }[c]) || '📄';
      const synced = watches.filter(w => w.cdio_uuid).length;

      const lines = [
        '🛰️ *Gov watches (changedetection.io)*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `Total: ${watches.length} (${synced} sincronizadas con cdio)`,
        '',
      ];
      for (const w of watches.slice(0, 12)) {
        const sync = w.cdio_uuid ? '✅' : '⏳';
        const lastChange = w.last_changed_at
          ? new Date(w.last_changed_at).toISOString().split('T')[0]
          : 'never';
        lines.push(`${sync} ${flag(w.country)} ${cat(w.category)} ${w.label} _(${lastChange})_`);
      }
      if (changes.length) {
        lines.push('', '🚨 *Últimos cambios detectados:*');
        for (const c of changes) {
          const dt = new Date(c.detected_at).toISOString().slice(0, 16).replace('T', ' ');
          lines.push(`  ${flag(c.country)} ${dt} — ${c.label || '?'}`);
        }
      } else {
        lines.push('', '✅ Sin cambios detectados aún');
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/alertas/, async (msg) => {
    try {
      const logs = await db.queryAll(
        `SELECT message, channel, sent_at, status
         FROM notification_log
         ORDER BY sent_at DESC LIMIT 5`
      );

      if (!logs.length) {
        send(msg.chat.id, '📭 No hay alertas registradas.');
        return;
      }

      const lines = ['📬 *Ultimas alertas enviadas:*', ''];
      for (const log of logs) {
        const date = new Date(log.sent_at).toLocaleDateString('es-ES');
        lines.push(`${log.status === 'sent' ? '✅' : '❌'} ${date} — ${log.channel}`);
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════
  //  P1: NOTICIAS — Configuracion de keywords
  // ═══════════════════════════════════════════════════════

  bot.onText(/\/noticias_config/, async (msg) => {
    try {
      const keywords = await db.queryAll(
        'SELECT * FROM rss_keywords ORDER BY weight DESC, keyword ASC'
      );

      if (!keywords.length) {
        send(msg.chat.id, '📰 No hay keywords configurados.\nUsa la API: POST /api/feeds/keywords');
        return;
      }

      const lines = [
        '📰 *ULTRA SYSTEM — Keywords RSS*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `Umbral de alerta: score >= 8`,
        '',
      ];

      for (const kw of keywords) {
        // Barra visual del peso
        const bar = '█'.repeat(kw.weight) + '░'.repeat(10 - kw.weight);
        lines.push(`${bar} ${kw.weight} — *${kw.keyword}*`);
      }

      lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`📊 ${keywords.length} keywords activos`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════
  //  P3: FINANZAS — Resumen + Presupuesto + Runway
  // ═══════════════════════════════════════════════════════

  bot.onText(/\/finanzas/, async (msg) => {
    try {
      const month = new Date().toISOString().slice(0, 7);
      const summary = await db.queryAll(
        `SELECT type, SUM(amount) as total, COUNT(*) as count
         FROM finances
         WHERE TO_CHAR(date, 'YYYY-MM') = $1
         GROUP BY type`,
        [month]
      );

      const income = parseFloat(summary.find(r => r.type === 'income')?.total || 0);
      const expense = parseFloat(summary.find(r => r.type === 'expense')?.total || 0);
      const balance = income - expense;

      const topExpenses = await db.queryAll(
        `SELECT category, SUM(amount) as total
         FROM finances
         WHERE TO_CHAR(date, 'YYYY-MM') = $1 AND type = 'expense'
         GROUP BY category ORDER BY total DESC LIMIT 3`,
        [month]
      );

      const lines = [
        '💰 *ULTRA SYSTEM — Finanzas*',
        `📅 Mes: ${month}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📈 Ingresos: $${income.toFixed(2)}`,
        `📉 Gastos: $${expense.toFixed(2)}`,
        `${balance >= 0 ? '✅' : '🔴'} Balance: $${balance.toFixed(2)}`,
      ];

      if (topExpenses.length) {
        lines.push('', '📊 Top gastos:');
        for (const cat of topExpenses) {
          lines.push(`   • ${cat.category}: $${parseFloat(cat.total).toFixed(2)}`);
        }
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3: Runway extendido (90d burn rate, NW, breakdown) ────
  bot.onText(/\/runway/, async (msg) => {
    try {
      const month = new Date().toISOString().slice(0, 7);
      const incRow = await db.queryOne(
        `SELECT COALESCE(SUM(amount_nzd), SUM(amount)) AS total FROM finances
         WHERE type='income' AND TO_CHAR(date,'YYYY-MM')=$1`, [month]
      );
      const expRow = await db.queryOne(
        `SELECT COALESCE(SUM(amount_nzd), SUM(amount)) AS total FROM finances
         WHERE type='expense' AND TO_CHAR(date,'YYYY-MM')=$1`, [month]
      );
      const burn90Row = await db.queryOne(
        `SELECT COALESCE(SUM(amount_nzd), SUM(amount))/90.0 AS daily FROM finances
         WHERE type='expense' AND date >= CURRENT_DATE - 90`
      );
      const income = parseFloat(incRow.total || 0);
      const expense = parseFloat(expRow.total || 0);
      const burn90 = parseFloat(burn90Row.daily || 0);
      const remaining = income - expense;
      const runway90 = burn90 > 0 ? Math.floor(remaining / burn90) : 999;

      const byAccount = await db.queryAll(
        `SELECT COALESCE(account, 'manual') AS account, COALESCE(currency, 'NZD') AS currency,
           COUNT(*) AS txns,
           SUM(CASE WHEN type='income' THEN COALESCE(amount_nzd, amount) ELSE 0 END) -
           SUM(CASE WHEN type='expense' THEN COALESCE(amount_nzd, amount) ELSE 0 END) AS net
         FROM finances WHERE TO_CHAR(date,'YYYY-MM') = $1
         GROUP BY account, currency ORDER BY net DESC LIMIT 6`, [month]
      );

      const lines = [
        '🏃 *ULTRA SYSTEM — Runway extendido*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📅 ${month}`,
        '',
        `📈 Ingresos: $${income.toFixed(2)} NZD`,
        `📉 Gastos: $${expense.toFixed(2)} NZD`,
        `💵 Balance: $${remaining.toFixed(2)} NZD`,
        '',
        `🔥 Burn 90d: $${burn90.toFixed(2)}/día`,
        `⏳ Runway (90d burn): *${runway90} días*`,
      ];
      if (byAccount.length) {
        lines.push('', '📊 *Por cuenta:*');
        for (const a of byAccount) {
          const net = parseFloat(a.net || 0);
          const sign = net >= 0 ? '+' : '';
          lines.push(`   ${a.account} (${a.currency}): ${sign}$${net.toFixed(2)} · ${a.txns} txns`);
        }
      }
      lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3: FX rates ──────────────────────────────────
  bot.onText(/\/fx(?:\s+(\w+)\s+(\w+))?(?:\s+([\d.]+))?/, async (msg, match) => {
    try {
      const fxMod = require('./fx');
      // /fx EUR NZD 100  → conversión específica
      if (match[1] && match[2]) {
        const from = match[1].toUpperCase();
        const to = match[2].toUpperCase();
        const amount = parseFloat(match[3] || 1);
        const converted = await fxMod.convert(amount, from, to);
        if (converted === null) {
          send(msg.chat.id, `❌ Rate ${from}→${to} no cacheado todavía. Llama /fx solo para refresh.`);
          return;
        }
        send(msg.chat.id, `💱 ${amount} ${from} = *${converted.toFixed(2)} ${to}*`, 'Markdown');
        return;
      }
      // /fx solo → lista todos los rates
      const rates = await fxMod.listLatestRates();
      if (!rates.length) {
        // Lazy fetch on first call
        await fxMod.fetchLatest();
        const r2 = await fxMod.listLatestRates();
        if (!r2.length) { send(msg.chat.id, '❌ No hay rates disponibles'); return; }
        rates.push(...r2);
      }
      const lines = ['💱 *Tipos de cambio (base NZD)*', '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rates) {
        const rate = parseFloat(r.rate);
        lines.push(`   1 NZD = ${rate.toFixed(4)} ${r.quote}`);
      }
      lines.push('', `📅 ${rates[0].date} · ${rates[0].source}`);
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 _Uso: /fx EUR NZD 100_');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/presupuesto/, async (msg) => {
    try {
      const month = new Date().toISOString().slice(0, 7);

      // Totales del mes
      const incomeRow = await db.queryOne(
        `SELECT COALESCE(SUM(amount), 0) as total FROM finances
         WHERE type = 'income' AND TO_CHAR(date, 'YYYY-MM') = $1`, [month]
      );
      const expenseRow = await db.queryOne(
        `SELECT COALESCE(SUM(amount), 0) as total FROM finances
         WHERE type = 'expense' AND TO_CHAR(date, 'YYYY-MM') = $1`, [month]
      );

      const income = parseFloat(incomeRow.total);
      const expense = parseFloat(expenseRow.total);
      const remaining = income - expense;

      // Burn rate
      const dayOfMonth = new Date().getDate();
      const dailyBurn = dayOfMonth > 0 ? expense / dayOfMonth : 0;
      const runway = dailyBurn > 0 ? Math.floor(remaining / dailyBurn) : (remaining > 0 ? 999 : 0);

      // Alertas de budget
      const budgetAlerts = await db.queryAll(
        `SELECT b.category, b.monthly_limit, COALESCE(SUM(f.amount), 0) as spent,
           ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1) as pct
         FROM budgets b
         LEFT JOIN finances f ON LOWER(f.category) = LOWER(b.category)
           AND f.type = 'expense' AND TO_CHAR(f.date, 'YYYY-MM') = $1
         GROUP BY b.category, b.monthly_limit
         HAVING COALESCE(SUM(f.amount), 0) >= b.monthly_limit * 0.8
         ORDER BY pct DESC`, [month]
      );

      const lines = [
        '💰 *ULTRA SYSTEM — Presupuesto*',
        `📅 ${month}`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📈 Ingresos: $${income.toFixed(2)}`,
        `📉 Gastos: $${expense.toFixed(2)}`,
        `💵 Restante: $${remaining.toFixed(2)}`,
        '',
        `🔥 Burn diario: $${dailyBurn.toFixed(2)}/dia`,
        `⏳ Runway: ${runway} dias`,
      ];

      if (budgetAlerts.length) {
        lines.push('', '⚠️ *Categorias excediendo 80%:*');
        for (const a of budgetAlerts) {
          const emoji = parseFloat(a.pct) >= 100 ? '🔴' : '🟡';
          lines.push(`${emoji} ${a.category}: $${parseFloat(a.spent).toFixed(2)}/$${parseFloat(a.monthly_limit).toFixed(2)} (${a.pct}%)`);
        }
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════
  //  P5: OPORTUNIDADES — Listado + Pipeline
  // ═══════════════════════════════════════════════════════

  bot.onText(/\/oportunidades/, async (msg) => {
    try {
      const opps = await db.queryAll(
        `SELECT title, source, status, deadline, category
         FROM opportunities
         WHERE status NOT IN ('rejected', 'won')
         ORDER BY deadline ASC NULLS LAST, created_at DESC
         LIMIT 10`
      );

      if (!opps.length) {
        send(msg.chat.id, '📭 No hay oportunidades activas.');
        return;
      }

      const statusEmoji = { new: '🆕', contacted: '📧', applied: '📨' };
      const lines = [
        '🎯 *ULTRA SYSTEM — Oportunidades*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
      ];

      for (const o of opps) {
        const emoji = statusEmoji[o.status] || '📌';
        const deadline = o.deadline ? ` (${new Date(o.deadline).toISOString().split('T')[0]})` : '';
        lines.push(`${emoji} *${o.title}*`);
        if (o.source) lines.push(`   📍 ${o.source}`);
        if (o.category) lines.push(`   🏷️ ${o.category}${deadline}`);
        lines.push('');
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P2: Top high-score jobs (presencial) ────────
  bot.onText(/\/jobs_top/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT title, company, location_country, location_raw, total_score, salary_min, salary_max, salary_currency, url
         FROM job_listings
         WHERE total_score >= 30 AND status = 'new'
           AND (is_remote = FALSE OR is_remote IS NULL)
         ORDER BY total_score DESC, posted_at DESC NULLS LAST LIMIT 10`
      );
      if (!rows.length) {
        send(msg.chat.id, '📭 Sin empleos high-score todavía. Llama POST /api/jobs/fetch para forzar.');
        return;
      }
      const flag = (c) => ({ NZ: '🇳🇿', AU: '🇦🇺', ES: '🇪🇸', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', CA: '🇨🇦' }[c] || '🌍');
      const lines = ['💼 *Top empleos presenciales*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const j of rows) {
        const sal = j.salary_min && j.salary_max ? ` · 💰 ${j.salary_min}-${j.salary_max} ${j.salary_currency || 'USD'}` : '';
        lines.push(`⭐ *${j.total_score}* ${flag(j.location_country)} ${j.title.substring(0, 80)}`);
        lines.push(`   🏢 ${j.company} · ${j.location_raw}${sal}`);
        lines.push(`   🔗 ${j.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P2: Tracked companies ────────────────────────
  bot.onText(/\/jobs_companies/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT name, ats_type, country, sector, visa_sponsor, last_count, last_fetched
         FROM emp_tracked_companies WHERE is_active = TRUE
         ORDER BY last_count DESC NULLS LAST, name LIMIT 25`
      );
      if (!rows.length) { send(msg.chat.id, '📭 Sin empresas registradas.'); return; }
      const flag = (c) => ({ NZ: '🇳🇿', AU: '🇦🇺', ES: '🇪🇸', US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪' }[c] || '🌍');
      const lines = ['🏢 *Tracked companies (ATS)*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const c of rows) {
        const visa = c.visa_sponsor ? ' 🛂' : '';
        const last = c.last_count != null ? ` · ${c.last_count} jobs` : '';
        lines.push(`${flag(c.country)} *${c.name}*${visa} (${c.ats_type})${last}`);
      }
      lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`Total: ${rows.length} (presencial)`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P5: Top high-score opportunities ────────────
  bot.onText(/\/opps_top/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT title, source, url, match_score, salary_min, salary_max, currency, payout_type
         FROM opportunities
         WHERE match_score >= 5 AND status = 'new'
         ORDER BY match_score DESC, posted_at DESC NULLS LAST LIMIT 10`
      );
      if (!rows.length) {
        send(msg.chat.id, '📭 Sin oportunidades high-score. Llama POST /api/opportunities/fetch para forzar fetch.');
        return;
      }
      const lines = ['🎯 *Top oportunidades remotas (high-score)*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const o of rows) {
        const salary = o.salary_min && o.salary_max ? ` · 💰 ${o.salary_min}-${o.salary_max} ${o.currency || 'USD'}` :
                       o.salary_min ? ` · 💰 ${o.salary_min}+ ${o.currency || 'USD'}` : '';
        const ptype = o.payout_type ? ` (${o.payout_type})` : '';
        lines.push(`⭐ *${o.match_score}* · ${o.title.substring(0, 100)}`);
        lines.push(`   📍 ${o.source}${ptype}${salary}`);
        lines.push(`   🔗 ${o.url}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P5: Stats por fuente ────────────────────────
  bot.onText(/\/opps_sources/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT source, count(*) AS total,
           count(*) FILTER (WHERE status='new') AS news,
           max(match_score) AS top,
           max(last_seen) AS last_fetched
         FROM opportunities
         WHERE source IS NOT NULL
         GROUP BY source ORDER BY total DESC`
      );
      if (!rows.length) {
        send(msg.chat.id, '📭 Sin opportunities en DB. Primer fetch: POST /api/opportunities/fetch');
        return;
      }
      const lines = ['📊 *Opportunities por fuente*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows) {
        const last = r.last_fetched ? new Date(r.last_fetched).toISOString().split('T')[0] : 'never';
        lines.push(`📍 *${r.source}* — ${r.total} total (${r.news} new)`);
        lines.push(`   ⭐ top score: ${r.top || 0} · last: ${last}`);
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/pipeline/, async (msg) => {
    try {
      // Conteos por status
      const counts = await db.queryAll(
        `SELECT status, COUNT(*) as count FROM opportunities GROUP BY status`
      );
      const total = await db.queryOne('SELECT COUNT(*) as total FROM opportunities');

      const statusMap = {};
      for (const row of counts) statusMap[row.status] = parseInt(row.count);

      const newC = statusMap['new'] || 0;
      const contacted = statusMap['contacted'] || 0;
      const applied = statusMap['applied'] || 0;
      const rejected = statusMap['rejected'] || 0;
      const won = statusMap['won'] || 0;
      const totalC = parseInt(total.total) || 0;

      // Visualizacion text-based del funnel
      const maxBar = 20;
      const barFor = (val) => {
        if (totalC === 0) return '';
        const len = Math.max(1, Math.round(val / totalC * maxBar));
        return '█'.repeat(len);
      };

      const winRate = totalC > 0 ? Math.round(won / totalC * 100) : 0;

      // Follow-ups necesarios
      const followUps = await db.queryAll(
        `SELECT title FROM opportunities
         WHERE status = 'contacted' AND created_at < NOW() - INTERVAL '7 days'
         LIMIT 5`
      );

      const lines = [
        '🎯 *ULTRA SYSTEM — Pipeline*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `Total: ${totalC} oportunidades`,
        '',
        `🆕 Nuevas:      ${barFor(newC)} ${newC}`,
        `📧 Contactadas: ${barFor(contacted)} ${contacted}`,
        `📨 Aplicadas:   ${barFor(applied)} ${applied}`,
        `❌ Rechazadas:  ${barFor(rejected)} ${rejected}`,
        `✅ Ganadas:     ${barFor(won)} ${won}`,
        '',
        `📊 Win rate: ${winRate}%`,
      ];

      if (followUps.length) {
        lines.push('', '⚠️ *Necesitan follow-up (>7 dias):*');
        for (const f of followUps) {
          lines.push(`   • ${f.title}`);
        }
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════
  //  P6: LOGISTICA — 7 dias + Proximas 48h
  // ═══════════════════════════════════════════════════════

  bot.onText(/\/logistica/, async (msg) => {
    try {
      const items = await db.queryAll(
        `SELECT type, title, date, location, status,
         (date - CURRENT_DATE) AS days_until
         FROM logistics
         WHERE date >= CURRENT_DATE
         AND date <= CURRENT_DATE + INTERVAL '7 days'
         AND status != 'done'
         ORDER BY date ASC`
      );

      if (!items.length) {
        send(msg.chat.id, '✅ Nada programado en los proximos 7 dias.');
        return;
      }

      const typeEmoji = { transport: '🚌', accommodation: '🏠', visa: '🛂', appointment: '📋' };
      const lines = [
        '🗺️ *ULTRA SYSTEM — Logistica (7 dias)*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
      ];

      for (const item of items) {
        const emoji = typeEmoji[item.type] || '📌';
        const dateStr = new Date(item.date).toISOString().split('T')[0];
        const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';
        lines.push(`${emoji} ${statusIcon} *${item.title}*`);
        lines.push(`   📅 ${dateStr} (en ${item.days_until} dias)`);
        if (item.location) lines.push(`   📍 ${item.location}`);
        lines.push('');
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P6: POIs cerca de current location ──────────────
  bot.onText(/\/poi(?:\s+(\w+))?(?:\s+(\d+))?/, async (msg, match) => {
    try {
      const overpass = require('./overpass');
      const cur = await db.queryOne(
        `SELECT name, lat AS latitude, lon AS longitude FROM log_locations WHERE is_current=TRUE ORDER BY id DESC LIMIT 1`
      );
      if (!cur) {
        send(msg.chat.id, '❌ Sin current location. Inserta una en log_locations con is_current=TRUE.');
        return;
      }
      const poiType = match[1] || null;
      const radius = parseInt(match[2] || 20);
      const rows = await overpass.listNearby(parseFloat(cur.latitude), parseFloat(cur.longitude), radius, poiType);
      if (!rows.length) {
        send(msg.chat.id, `📭 Sin POIs en ${radius}km. Llama POST /api/logistics/poi/refresh para fetch desde Overpass.`);
        return;
      }
      const emojiFor = { campsite: '⛺', water: '🚰', dump_station: '🚽', shower: '🚿', toilets: '🚻', fuel: '⛽' };
      const lines = [`📍 *POIs cerca de ${cur.name}*`, '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows.slice(0, 15)) {
        const e = emojiFor[r.poi_type] || '📌';
        lines.push(`${e} *${r.name.substring(0, 60)}*`);
        lines.push(`   📏 ${r.distance_km} km · ${r.poi_type}`);
      }
      lines.push('', `━━━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💡 _Uso: /poi campsite 30 (tipo y radio)_`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P6: iOverlander van-life POIs cerca de current location ──
  // /iov [tipo] [radio_km]   ej: /iov           → todos en 50km
  //                              /iov campsite  → solo campsite
  //                              /iov wild_camp 100
  // Lee de log_pois donde source='ioverlander' (datos importados via
  // seed_iov_canada.js o futuros downloads oficiales). NO crawlea iOverlander
  // online — todo on-demand sobre la copia local respetando el opt-out.
  bot.onText(/\/iov(?:\s+(\w+))?(?:\s+(\d+))?/, async (msg, match) => {
    try {
      const overpass = require('./overpass');
      const cur = await db.queryOne(
        `SELECT name, lat AS latitude, lon AS longitude FROM log_locations WHERE is_current=TRUE ORDER BY id DESC LIMIT 1`
      );
      if (!cur) {
        send(msg.chat.id, '❌ Sin current location. Comparte tu ubicación de Telegram o usa `/donde Ciudad`.', 'Markdown');
        return;
      }
      const poiType = match[1] || null;
      const radius = parseInt(match[2] || 50);
      const rows = await overpass.listNearby(
        parseFloat(cur.latitude), parseFloat(cur.longitude), radius, poiType, 'ioverlander'
      );
      if (!rows.length) {
        const total = await db.queryOne(`SELECT COUNT(*)::int AS c FROM log_pois WHERE source='ioverlander'`);
        const lines = [
          `📭 Sin POIs iOverlander en ${radius}km${poiType ? ` (tipo=${poiType})` : ''}.`,
          '',
          `Dataset local: *${(total?.c || 0).toLocaleString()}* POIs (sólo Canada por ahora).`,
          'Cobertura global requiere subscripción Unlimited en iOverlander.com.',
          '',
          '_Uso: `/iov [tipo] [radio_km]` — ej: `/iov wild_camp 100`_',
        ];
        send(msg.chat.id, lines.join('\n'), 'Markdown');
        return;
      }
      const emojiFor = {
        wild_camp: '🏕️', informal_camp: '⛺', campsite: '🏞️',
        water: '🚰', dump_station: '🚽', shower: '🚿', toilets: '🚻',
        fuel: '⛽', propane: '🔥', mechanic: '🔧', laundromat: '🧺',
        food: '🍴', lodging: '🏨', wifi: '📶', ev_charging: '🔌',
        shopping: '🛒', medical: '⚕️', vet: '🐾', border: '🛂',
      };
      const lines = [`🌎 *iOverlander cerca de ${cur.name}*`, '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows.slice(0, 12)) {
        const e = emojiFor[r.poi_type] || '📌';
        const ams = [];
        if (r.has_water) ams.push('💧');
        if (r.has_dump) ams.push('🚽');
        if (r.has_shower) ams.push('🚿');
        if (r.has_wifi) ams.push('📶');
        if (r.has_power) ams.push('🔌');
        const tagged = (r.tags?.big_rig_friendly === true) ? ' 🚐' : '';
        lines.push(`${e} *${r.name.substring(0, 55).replace(/[*_`]/g, '')}*${tagged}`);
        lines.push(`   📏 ${r.distance_km}km · ${r.poi_type}${ams.length ? ' · ' + ams.join(' ') : ''}`);
      }
      if (rows.length > 12) lines.push('', `_…y ${rows.length - 12} más en ${radius}km_`);
      lines.push('', `━━━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`💡 _\`/iov [tipo] [radio]\` — tipos: campsite, wild_camp, water, shower, fuel, mechanic, dump_station_`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P6: Forecast 7d para current location ───────────
  bot.onText(/\/clima/, async (msg) => {
    try {
      const weatherMod = require('./weather');
      const cur = await weatherMod.getCurrentLocation();
      if (!cur) {
        send(msg.chat.id, '❌ Sin current location. Inserta una en log_locations con is_current=TRUE.');
        return;
      }
      let rows = await weatherMod.getForecast(parseFloat(cur.latitude), parseFloat(cur.longitude));
      if (!rows.length) {
        await weatherMod.fetchForecast(parseFloat(cur.latitude), parseFloat(cur.longitude));
        rows = await weatherMod.getForecast(parseFloat(cur.latitude), parseFloat(cur.longitude));
      }
      if (!rows.length) { send(msg.chat.id, '❌ No hay forecast disponible'); return; }
      const lines = [`🌡️ *Forecast 7d — ${cur.name}*`, '━━━━━━━━━━━━━━━━━━━━━━━━'];
      for (const r of rows) {
        const date = new Date(r.date).toISOString().split('T')[0];
        lines.push(`${r.summary} *${date}*`);
        lines.push(`   🌡️ ${parseFloat(r.temp_min).toFixed(0)}°/${parseFloat(r.temp_max).toFixed(0)}°  💧 ${parseFloat(r.precip_mm).toFixed(1)}mm  💨 ${parseFloat(r.wind_kph).toFixed(0)} km/h`);
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P6: Memberships renewals ────────────────────────
  bot.onText(/\/memberships/, async (msg) => {
    try {
      const rows = await db.queryAll(
        `SELECT platform, annual_cost, currency, renews_at, notes,
          (renews_at - CURRENT_DATE) AS days_remaining
         FROM log_memberships
         WHERE is_active = TRUE ORDER BY renews_at ASC NULLS LAST`
      );
      if (!rows.length) { send(msg.chat.id, '📭 Sin memberships activas.'); return; }
      const lines = ['🏠 *Memberships housesit/work-exchange*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      let totalAnnual = 0;
      for (const r of rows) {
        const d = r.renews_at ? new Date(r.renews_at).toISOString().split('T')[0] : 'N/A';
        const urgent = r.days_remaining != null && r.days_remaining <= 30 ? '🔴' : r.days_remaining != null && r.days_remaining <= 60 ? '🟡' : '🟢';
        lines.push(`${urgent} *${r.platform}* — ${r.annual_cost} ${r.currency}/yr`);
        lines.push(`   📅 Renueva ${d}${r.days_remaining != null ? ` (${r.days_remaining}d)` : ''}`);
        if (r.notes) lines.push(`   💬 ${r.notes.substring(0, 70)}`);
        lines.push('');
        totalAnnual += parseFloat(r.annual_cost || 0);
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push(`💰 Total anual: ~${totalAnnual.toFixed(0)} (mixed currencies)`);
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/proximas/, async (msg) => {
    try {
      const items = await db.queryAll(
        `SELECT type, title, date, location, status,
         (date - CURRENT_DATE) AS days_until
         FROM logistics
         WHERE date >= CURRENT_DATE
           AND date <= CURRENT_DATE + INTERVAL '2 days'
           AND status != 'done'
         ORDER BY date ASC`
      );

      if (!items.length) {
        send(msg.chat.id, '✅ Nada programado en las proximas 48 horas.');
        return;
      }

      const typeEmoji = { transport: '🚌', accommodation: '🏠', visa: '🛂', appointment: '📋' };
      const urgencyEmoji = { 0: '🔴', 1: '🟡', 2: '🟢' };
      const lines = [
        '🗺️ *ULTRA SYSTEM — Proximas 48h*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
      ];

      for (const item of items) {
        const emoji = typeEmoji[item.type] || '📌';
        const urgency = urgencyEmoji[item.days_until] || '🟢';
        const dateStr = new Date(item.date).toISOString().split('T')[0];
        const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';
        const label = item.days_until === 0 ? 'HOY' : item.days_until === 1 ? 'MANANA' : `en ${item.days_until} dias`;

        lines.push(`${urgency} ${emoji} ${statusIcon} *${item.title}*`);
        lines.push(`   📅 ${dateStr} — ${label}`);
        if (item.location) lines.push(`   📍 ${item.location}`);
        lines.push('');
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ═══════════════════════════════════════════════════════
  //  P7: BIO-CHECK — Resumen semanal + correlaciones
  // ═══════════════════════════════════════════════════════

  // ─── P7: Health alerts (outbreak) ──────────────────
  bot.onText(/\/health(?:\s+(\w{2}))?/, async (msg, match) => {
    try {
      const country = match[1]?.toUpperCase();
      const where = country ? `WHERE country_iso = '${country}' OR country_iso IS NULL` : '';
      const rows = await db.queryAll(
        `SELECT source, country_iso, disease, title, url, published_at
         FROM health_alerts ${where}
         ORDER BY published_at DESC NULLS LAST LIMIT 10`
      );
      if (!rows.length) {
        send(msg.chat.id, '✅ Sin outbreak alerts. Llama POST /api/bio/health-alerts/refresh para forzar fetch.');
        return;
      }
      const lines = [`🩺 *Outbreak Alerts${country ? ' — ' + country : ''}*`, '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows) {
        const flag = r.country_iso ? `[${r.country_iso}]` : '[GLOBAL]';
        const dis = r.disease ? `*${r.disease}* · ` : '';
        const date = r.published_at ? new Date(r.published_at).toISOString().split('T')[0] : '';
        lines.push(`⚠️ ${flag} ${dis}${r.title.substring(0, 100)}`);
        lines.push(`   📰 ${r.source} · ${date}`);
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 _Uso: /health NZ para filtrar país_');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7: External services status (wger/mealie/grocy/fasten) ───
  bot.onText(/\/external/, async (msg) => {
    try {
      const externalHealth = require('./external_health');
      // Hace un probe en vivo + lee status
      await externalHealth.probeAll();
      const rows = await externalHealth.getStatus();
      if (!rows.length) {
        send(msg.chat.id, '❌ Sin servicios externos registrados.');
        return;
      }
      const emojiFor = { healthy: '🟢', degraded: '🟡', down: '🔴', unknown: '⚪' };
      const lines = ['🐳 *External Services (P7 self-hosted)*', '━━━━━━━━━━━━━━━━━━━━━━━━', ''];
      for (const r of rows) {
        const e = emojiFor[r.health] || '⚪';
        lines.push(`${e} *${r.name}* — port ${r.external_port} (${r.health})`);
        lines.push(`   ${r.purpose}`);
        if (r.last_status === -1) {
          lines.push(`   ❌ container down o no responde`);
        } else {
          lines.push(`   HTTP ${r.last_status}`);
        }
        lines.push('');
      }
      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      lines.push('💡 _Acceder UI: http://localhost:8001-8004_');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/bio$/, async (msg) => {
    try {
      const weekly = await db.queryOne(
        `SELECT
           COUNT(*) AS entries,
           ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep,
           ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
           ROUND(AVG(mood)::numeric, 1) AS avg_mood,
           ROUND(AVG(exercise_minutes)::numeric, 0) AS avg_exercise
         FROM bio_checks
         WHERE date >= CURRENT_DATE - 7`
      );

      if (!weekly || parseInt(weekly.entries) === 0) {
        send(msg.chat.id, '📭 No hay registros de bio-check esta semana.');
        return;
      }

      const bar = (val) => {
        const filled = Math.round(parseFloat(val));
        return '█'.repeat(filled) + '░'.repeat(10 - filled);
      };

      const lines = [
        '🧬 *ULTRA SYSTEM — Bio-Check Semanal*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📊 Registros: ${weekly.entries}/7`,
        '',
        `😴 Sueno: ${weekly.avg_sleep}h`,
        `⚡ Energia: ${bar(weekly.avg_energy)} ${weekly.avg_energy}/10`,
        `😊 Animo: ${bar(weekly.avg_mood)} ${weekly.avg_mood}/10`,
        `🏃 Ejercicio: ${weekly.avg_exercise} min/dia`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
      ];

      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.onText(/\/biosemana/, async (msg) => {
    try {
      // Promedios semanales
      const weekly = await db.queryOne(
        `SELECT
           COUNT(*) AS entries,
           ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep,
           ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
           ROUND(AVG(mood)::numeric, 1) AS avg_mood,
           ROUND(AVG(exercise_minutes)::numeric, 0) AS avg_exercise
         FROM bio_checks
         WHERE date >= CURRENT_DATE - 7`
      );

      if (!weekly || parseInt(weekly.entries) === 0) {
        send(msg.chat.id, '📭 No hay registros de bio-check esta semana.');
        return;
      }

      // Correlaciones (ultimos 30 dias)
      const data = await db.queryAll(
        `SELECT sleep_hours, energy_level, mood, exercise_minutes
         FROM bio_checks WHERE date >= CURRENT_DATE - 30 ORDER BY date DESC`
      );

      const bar = (val) => {
        const filled = Math.round(parseFloat(val));
        return '█'.repeat(Math.min(10, Math.max(0, filled))) + '░'.repeat(Math.max(0, 10 - filled));
      };

      const lines = [
        '🧬 *ULTRA SYSTEM — Bio Resumen Semanal*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📊 Registros: ${weekly.entries}/7`,
        '',
        `😴 Sueno: ${weekly.avg_sleep}h`,
        `⚡ Energia: ${bar(weekly.avg_energy)} ${weekly.avg_energy}/10`,
        `😊 Animo: ${bar(weekly.avg_mood)} ${weekly.avg_mood}/10`,
        `🏃 Ejercicio: ${weekly.avg_exercise} min/dia`,
      ];

      // Alertas
      const avgSleep = parseFloat(weekly.avg_sleep);
      const avgEnergy = parseFloat(weekly.avg_energy);
      if (avgSleep < 6) lines.push('', `⚠️ Sueno bajo (${avgSleep}h) — prioriza descanso`);
      if (avgEnergy < 4) lines.push('', `⚠️ Energia baja (${avgEnergy}/10) — revisa rutina`);

      // Correlaciones si hay suficientes datos
      if (data.length >= 3) {
        const sleep = data.map(d => parseFloat(d.sleep_hours));
        const energy = data.map(d => parseInt(d.energy_level));
        const mood = data.map(d => parseInt(d.mood));
        const exercise = data.map(d => parseInt(d.exercise_minutes));

        const corrs = [
          { label: 'Sueno → Energia', val: pearson(sleep, energy) },
          { label: 'Sueno → Animo', val: pearson(sleep, mood) },
          { label: 'Ejercicio → Energia', val: pearson(exercise, energy) },
        ];

        lines.push('', '📈 *Correlaciones (30 dias):*');
        for (const c of corrs) {
          if (c.val !== null) {
            const arrow = c.val > 0 ? '↑' : '↓';
            const strength = Math.abs(c.val) >= 0.7 ? '💪' : Math.abs(c.val) >= 0.4 ? '📊' : '〰️';
            lines.push(`${strength} ${c.label}: ${c.val} ${arrow}`);
          }
        }
      }

      lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P6: Set current location ─────────────────────────
  // Opción A: comparte ubicación nativa de Telegram (📎 → Location)
  bot.on('location', async (msg) => {
    try {
      const { latitude, longitude } = msg.location;
      const place = await reverseGeocode(latitude, longitude);
      const name = place.name || `Lat ${latitude.toFixed(3)}, Lon ${longitude.toFixed(3)}`;
      await setCurrentLocation({ name, lat: latitude, lon: longitude, country: place.country, region: place.region });
      send(
        msg.chat.id,
        `📍 *Current location actualizada*\n${name}${place.country ? ` (${place.country})` : ''}\n\`${latitude.toFixed(4)}, ${longitude.toFixed(4)}\`\n\nProbando /clima y /poi…`,
        'Markdown'
      );
    } catch (err) {
      send(msg.chat.id, `❌ Error guardando ubicación: ${err.message}`);
    }
  });

  // Opción B: /donde Auckland — geocoding por nombre vía Nominatim
  bot.onText(/\/donde(?:\s+(.+))?/, async (msg, match) => {
    try {
      const query = (match[1] || '').trim();
      if (!query) {
        const cur = await db.queryOne(
          `SELECT name, lat, lon, country FROM log_locations WHERE is_current=TRUE ORDER BY id DESC LIMIT 1`
        );
        if (!cur) {
          send(msg.chat.id, '📭 Sin current location.\n\nOpciones:\n• 📎 Comparte tu ubicación de Telegram (más rápido)\n• `/donde Auckland` para fijar por nombre', 'Markdown');
          return;
        }
        send(msg.chat.id, `📍 Current: *${cur.name}*${cur.country ? ` (${cur.country})` : ''}\n\`${cur.lat}, ${cur.lon}\``, 'Markdown');
        return;
      }
      const place = await forwardGeocode(query);
      if (!place) { send(msg.chat.id, `❌ No encontré "${query}". Prueba con otro nombre.`); return; }
      await setCurrentLocation(place);
      send(msg.chat.id, `📍 *Current location actualizada*\n${place.name}${place.country ? ` (${place.country})` : ''}\n\`${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}\``, 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.on('polling_error', (err) => {
    console.error('❌ Telegram polling error:', err.code);
  });

  return bot;
}

// ═══════════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════════

/**
 * Correlacion de Pearson entre dos arrays
 */
function pearson(x, y) {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return null;
  return Math.round((numerator / denominator) * 100) / 100;
}

// ─── Emojis por tipo de documento ──────────────────────
const TYPE_EMOJI = {
  visa: '🛂',
  pasaporte: '📕',
  seguro: '🛡️',
  wof: '🚗',
  rego: '🚙',
  ird: '💰',
  default: '📄',
};

const urgencyEmojiDoc = (days) => {
  if (days <= 7) return '🔴';
  if (days <= 30) return '🟡';
  return '🟢';
};

/**
 * Formatea alertas de documentos
 */
function formatDocumentAlert(docs) {
  let message = '📋 *ULTRA SYSTEM — Alertas de Documentos*\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const d of docs) {
    const emoji = TYPE_EMOJI[d.document_type] || TYPE_EMOJI.default;
    const urgent = urgencyEmojiDoc(d.days_remaining);
    const expDate = new Date(d.expiry_date).toISOString().split('T')[0];

    message += `${urgent} ${emoji} *${d.document_name}*\n`;
    message += `   ⏳ Caduca en: *${d.days_remaining} dias* (${expDate})\n`;
    if (d.notes) message += `   💬 ${d.notes}\n`;
    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 _Enviado por Ultra Engine_';
  return message;
}

/**
 * Envia mensaje al chat configurado
 */
async function send(chatId, text, parseMode) {
  if (!bot) return;
  const target = chatId || process.env.TELEGRAM_CHAT_ID;
  try {
    const opts = parseMode ? { parse_mode: parseMode } : {};
    await bot.sendMessage(target, text, opts);
  } catch (err) {
    // 2026-04-11: titles with unescaped *, _, [ etc. break Markdown
    // parsing ("can't parse entities"). Retry once as plain text so
    // the message still gets through instead of being silently lost.
    if (parseMode && /parse entities|can't find end/i.test(err.message)) {
      try {
        await bot.sendMessage(target, text);
        return;
      } catch (err2) {
        console.error('❌ Error enviando Telegram (plain retry):', err2.message);
        return;
      }
    }
    console.error('❌ Error enviando Telegram:', err.message);
  }
}

/**
 * Envia alerta al chat del usuario (para el scheduler)
 */
async function sendAlert(text, parseMode = 'Markdown') {
  await send(process.env.TELEGRAM_CHAT_ID, text, parseMode);
}

/**
 * Registra la notificacion en la DB
 */
async function logNotification(alertId, message, status = 'sent') {
  try {
    await db.query(
      `INSERT INTO notification_log (alert_id, message, channel, status)
       VALUES ($1, $2, 'telegram', $3)`,
      [alertId, message, status]
    );
  } catch (err) {
    console.error('❌ Error registrando notificacion:', err.message);
  }
}

/**
 * Devuelve si el bot esta activo y conectado
 */
function isActive() {
  return bot !== null;
}

/**
 * Reverse geocoding via Nominatim (free, no auth). User-Agent obligatorio.
 */
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ultra-system/1.0 (telegram bot)' } });
    if (!r.ok) return {};
    const j = await r.json();
    const a = j.address || {};
    const name = a.city || a.town || a.village || a.suburb || a.county || j.name || j.display_name?.split(',')[0];
    return { name, country: a.country_code ? a.country_code.toUpperCase() : null, region: a.state || null };
  } catch { return {}; }
}

/**
 * Forward geocoding via Nominatim (free, no auth). User-Agent obligatorio.
 */
async function forwardGeocode(query) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ultra-system/1.0 (telegram bot)' } });
    if (!r.ok) return null;
    const arr = await r.json();
    if (!arr.length) return null;
    const it = arr[0];
    const display = it.display_name || query;
    return {
      name: display.split(',')[0] || query,
      lat: parseFloat(it.lat),
      lon: parseFloat(it.lon),
      country: null, // jsonv2 sin addressdetails no devuelve cc; se puede enriquecer luego
      region: null,
    };
  } catch { return null; }
}

/**
 * Marca todas las locations existentes como no-current e inserta una nueva is_current=TRUE.
 */
async function setCurrentLocation({ name, lat, lon, country, region }) {
  await db.query(`UPDATE log_locations SET is_current = FALSE WHERE is_current = TRUE`);
  await db.query(
    `INSERT INTO log_locations (name, location_type, lat, lon, country, region, is_current)
     VALUES ($1, 'current', $2, $3, $4, $5, TRUE)`,
    [name, lat, lon, country, region]
  );
}

/**
 * P4 Fase 2 — Alerta de cambio detectado en página gov via changedetection.io
 */
async function alertGovChange(watch, summary) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chatId) return;
  const flag = ({ NZ: '🇳🇿', AU: '🇦🇺', ES: '🇪🇸', DZ: '🇩🇿' }[watch.country]) || '🌐';
  const cat = { visa: '🛂', tax: '💰', consular: '🏛️', other: '📄' }[watch.category] || '📄';
  const lines = [
    `🚨 *Cambio detectado en página gov*`,
    `${flag} ${cat} *${watch.label}*`,
    `🔗 ${watch.url}`,
  ];
  if (summary && summary.length > 0) {
    lines.push('', `📝 ${String(summary).slice(0, 300)}`);
  }
  try {
    await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown', disable_web_page_preview: true });
  } catch (err) {
    console.error('alertGovChange error:', err.message);
  }
}

module.exports = { init, send, sendAlert, logNotification, formatDocumentAlert, isActive, alertGovChange };
