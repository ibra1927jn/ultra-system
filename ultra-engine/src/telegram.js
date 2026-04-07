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
      '/alertas — Historial de alertas enviadas',
      '/ping — Verificar que el bot funciona',
      '',
      '📰 _P1 Noticias:_',
      '/feeds — Ultimas noticias',
      '/gdelt — GDELT global recientes',
      '/bsky — Bluesky relevantes',
      '/noticias\\_config — Keywords de scoring RSS',
      '',
      '💰 _P3 Finanzas:_',
      '/finanzas — Resumen financiero mensual',
      '/presupuesto — Budget + runway + alertas',
      '/runway — Runway extendido + breakdown cuentas',
      '/fx — Tipos de cambio NZD→{EUR,USD,...}',
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
      '/poi — POIs cerca de current location',
      '/clima — Forecast 7d Open-Meteo',
      '/donde — Ver/fijar current location (📎 location o `/donde Ciudad`)',
      '/memberships — Workaway/WWOOF/HelpX renewals',
      '',
      '🧬 _P7 Bio-Check:_',
      '/bio — Resumen semanal de salud',
      '/biosemana — Resumen + correlaciones',
      '/health — Outbreak alerts WHO/CDC/ECDC',
      '/external — Status 4 containers self-hosted',
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

module.exports = { init, send, sendAlert, logNotification, formatDocumentAlert, isActive };
