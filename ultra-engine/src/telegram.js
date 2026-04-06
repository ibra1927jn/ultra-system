// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bot de Telegram                          ║
// ║  Reemplaza n8n para envio de alertas + comandos          ║
// ║  Comandos smart: budget, pipeline, bio, logistica        ║
// ╚══════════════════════════════════════════════════════════╝

const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const { pearson } = require('./utils/pearson');
const { extractBioArrays } = require('./utils/bio_data');
const { BIO_WEEKLY_SQL, BIO_CORRELATION_SQL } = require('./utils/bio_queries');
const { formatDocumentAlert } = require('./utils/document_format');
const { calculateRunway, BUDGET_ALERTS_SQL, INCOME_TOTAL_SQL, EXPENSE_TOTAL_SQL } = require('./utils/budget_calc');
const { bar, LOGISTICS_TYPE_EMOJI, formatBioWeeklySummary } = require('./utils/scheduler_format');
const { toDateStr, currentMonth } = require('./utils/date_format');
const { formatPipelineMessage, formatOpportunitiesList } = require('./utils/pipeline_format');
const { formatFinanzasSummary } = require('./utils/finanzas_format');

let bot = null;

// ─── Handlers de comandos ───────────────────────────────

function handleStart(msg) {
  send(msg.chat.id, '🌎 *ULTRA SYSTEM* activo\\.\nUsa /help para ver comandos\\.', 'MarkdownV2');
}

function handleHelp(msg) {
  const help = [
    '🤖 *Comandos disponibles:*',
    '',
    '📋 _Basicos:_',
    '/status — Estado general del sistema',
    '/docs — Documentos proximos a caducar',
    '/alertas — Historial de alertas enviadas',
    '/ping — Verificar que el bot funciona',
    '',
    '📰 _P1 Noticias:_',
    '/feeds — Ultimas noticias',
    '/noticias\\_config — Keywords de scoring RSS',
    '',
    '💰 _P3 Finanzas:_',
    '/finanzas — Resumen financiero mensual',
    '/presupuesto — Budget + runway + alertas',
    '',
    '🎯 _P5 Oportunidades:_',
    '/oportunidades — Oportunidades activas',
    '/pipeline — Funnel de conversion',
    '',
    '🗺️ _P6 Logistica:_',
    '/logistica — Proximos 7 dias',
    '/proximas — Proximas 48 horas',
    '',
    '🧬 _P7 Bio-Check:_',
    '/bio — Resumen semanal de salud',
    '/biosemana — Resumen + correlaciones',
  ].join('\n');
  send(msg.chat.id, help, 'Markdown');
}

function handlePing(msg) {
  send(msg.chat.id, '🏓 Pong\\! Ultra System operativo\\.', 'MarkdownV2');
}

async function handleStatus(msg) {
  try {
    const [health, docsResult] = await Promise.all([
      db.healthCheck(),
      db.queryOne(
        `SELECT COUNT(*) as total,
         COUNT(*) FILTER (WHERE (expiry_date - CURRENT_DATE) <= alert_days AND (expiry_date - CURRENT_DATE) >= 0) as urgentes
         FROM document_alerts WHERE is_active = TRUE`
      ),
    ]);
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
}

async function handleDocs(msg) {
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
}

async function handleAlertas(msg) {
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
}

async function handleNoticiasConfig(msg) {
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
      lines.push(`${bar(kw.weight)} ${kw.weight} — *${kw.keyword}*`);
    }

    lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`📊 ${keywords.length} keywords activos`);
    send(msg.chat.id, lines.join('\n'), 'Markdown');
  } catch (err) {
    send(msg.chat.id, `❌ Error: ${err.message}`);
  }
}

async function handleFinanzas(msg) {
  try {
    const month = currentMonth();

    const [summary, topExpenses] = await Promise.all([
      db.queryAll(
        `SELECT type, SUM(amount) as total, COUNT(*) as count
         FROM finances
         WHERE TO_CHAR(date, 'YYYY-MM') = $1
         GROUP BY type`,
        [month]
      ),
      db.queryAll(
        `SELECT category, SUM(amount) as total
         FROM finances
         WHERE TO_CHAR(date, 'YYYY-MM') = $1 AND type = 'expense'
         GROUP BY category ORDER BY total DESC LIMIT 3`,
        [month]
      ),
    ]);

    const income = parseFloat(summary.find(r => r.type === 'income')?.total || 0);
    const expense = parseFloat(summary.find(r => r.type === 'expense')?.total || 0);

    const lines = formatFinanzasSummary({ month, income, expense, topExpenses });
    send(msg.chat.id, lines.join('\n'), 'Markdown');
  } catch (err) {
    send(msg.chat.id, `❌ Error: ${err.message}`);
  }
}

async function handlePresupuesto(msg) {
  try {
    const month = currentMonth();

    const [incomeRow, expenseRow, budgetAlerts] = await Promise.all([
      db.queryOne(INCOME_TOTAL_SQL, [month]),
      db.queryOne(EXPENSE_TOTAL_SQL, [month]),
      db.queryAll(BUDGET_ALERTS_SQL, [month]),
    ]);

    const income = parseFloat(incomeRow.total);
    const expense = parseFloat(expenseRow.total);
    const dayOfMonth = new Date().getDate();
    const { remaining, dailyBurn, runway } = calculateRunway(income, expense, dayOfMonth);

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
        const emoji = parseFloat(a.percent_used) >= 100 ? '🔴' : '🟡';
        lines.push(`${emoji} ${a.category}: $${parseFloat(a.spent).toFixed(2)}/$${parseFloat(a.monthly_limit).toFixed(2)} (${a.percent_used}%)`);
      }
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    send(msg.chat.id, lines.join('\n'), 'Markdown');
  } catch (err) {
    send(msg.chat.id, `❌ Error: ${err.message}`);
  }
}

async function handleOportunidades(msg) {
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

    const lines = formatOpportunitiesList(opps);
    send(msg.chat.id, lines.join('\n'), 'Markdown');
  } catch (err) {
    send(msg.chat.id, `❌ Error: ${err.message}`);
  }
}

async function handlePipeline(msg) {
  try {
    const [counts, total] = await Promise.all([
      db.queryAll(`SELECT status, COUNT(*) as count FROM opportunities GROUP BY status`),
      db.queryOne('SELECT COUNT(*) as total FROM opportunities'),
    ]);

    const statusMap = {};
    for (const row of counts) statusMap[row.status] = parseInt(row.count);

    const newC = statusMap['new'] || 0;
    const contacted = statusMap['contacted'] || 0;
    const applied = statusMap['applied'] || 0;
    const rejected = statusMap['rejected'] || 0;
    const won = statusMap['won'] || 0;
    const totalC = parseInt(total.total) || 0;

    const followUps = await db.queryAll(
      `SELECT title FROM opportunities
       WHERE status = 'contacted' AND created_at < NOW() - INTERVAL '7 days'
       LIMIT 5`
    );

    const pipelineStatusMap = { new: newC, contacted, applied, rejected, won };
    const lines = formatPipelineMessage(pipelineStatusMap, totalC, followUps);
    send(msg.chat.id, lines.join('\n'), 'Markdown');
  } catch (err) {
    send(msg.chat.id, `❌ Error: ${err.message}`);
  }
}

async function handleLogistica(msg) {
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

    const typeEmoji = LOGISTICS_TYPE_EMOJI;
    const lines = [
      '🗺️ *ULTRA SYSTEM — Logistica (7 dias)*',
      '━━━━━━━━━━━━━━━━━━━━━━━━',
    ];

    for (const item of items) {
      const emoji = typeEmoji[item.type] || '📌';
      const dateStr = toDateStr(item.date);
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
}

async function handleProximas(msg) {
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

    const typeEmoji = LOGISTICS_TYPE_EMOJI;
    const urgencyEmoji = { 0: '🔴', 1: '🟡', 2: '🟢' };
    const lines = [
      '🗺️ *ULTRA SYSTEM — Proximas 48h*',
      '━━━━━━━━━━━━━━━━━━━━━━━━',
    ];

    for (const item of items) {
      const emoji = typeEmoji[item.type] || '📌';
      const urgency = urgencyEmoji[item.days_until] || '🟢';
      const dateStr = toDateStr(item.date);
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
}

async function handleBio(msg) {
  try {
    const weekly = await db.queryOne(BIO_WEEKLY_SQL);

    if (!weekly || parseInt(weekly.entries) === 0) {
      send(msg.chat.id, '📭 No hay registros de bio-check esta semana.');
      return;
    }

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
}

async function handleBiosemana(msg) {
  try {
    const [weekly, data] = await Promise.all([
      db.queryOne(BIO_WEEKLY_SQL),
      db.queryAll(BIO_CORRELATION_SQL),
    ]);

    if (!weekly || parseInt(weekly.entries) === 0) {
      send(msg.chat.id, '📭 No hay registros de bio-check esta semana.');
      return;
    }

    let correlations = null;
    if (data.length >= 3) {
      const { sleep, energy, mood, exercise } = extractBioArrays(data);
      correlations = [
        { label: 'Sueno → Energia', val: pearson(sleep, energy) },
        { label: 'Sueno → Animo', val: pearson(sleep, mood) },
        { label: 'Ejercicio → Energia', val: pearson(exercise, energy) },
      ];
    }

    const lines = formatBioWeeklySummary({ weekly, correlations });
    send(msg.chat.id, lines.join('\n'), 'Markdown');
  } catch (err) {
    send(msg.chat.id, `❌ Error: ${err.message}`);
  }
}

// ─── Inicializacion del bot ─────────────────────────────

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

  console.debug('📲 Bot de Telegram conectado (chat_id:', chatId, ')');

  // Registrar comandos
  bot.onText(/\/start/, handleStart);
  bot.onText(/\/help/, handleHelp);
  bot.onText(/\/ping/, handlePing);
  bot.onText(/\/status/, handleStatus);
  bot.onText(/\/docs/, handleDocs);
  bot.onText(/\/alertas/, handleAlertas);
  bot.onText(/\/noticias_config/, handleNoticiasConfig);
  bot.onText(/\/finanzas/, handleFinanzas);
  bot.onText(/\/presupuesto/, handlePresupuesto);
  bot.onText(/\/oportunidades/, handleOportunidades);
  bot.onText(/\/pipeline/, handlePipeline);
  bot.onText(/\/logistica/, handleLogistica);
  bot.onText(/\/proximas/, handleProximas);
  bot.onText(/\/bio$/, handleBio);
  bot.onText(/\/biosemana/, handleBiosemana);

  bot.on('polling_error', (err) => {
    console.error('❌ Telegram polling error:', err.code);
  });

  return bot;
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

module.exports = { init, send, sendAlert, logNotification, isActive };
