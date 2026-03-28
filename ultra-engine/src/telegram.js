// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bot de Telegram                          ║
// ║  Reemplaza n8n para envío de alertas + comandos          ║
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
    console.warn('⚠️ TELEGRAM_CHAT_ID no configurado. Alertas automáticas no funcionarán.');
  }

  try {
    bot = new TelegramBot(token, { polling: true });
  } catch (err) {
    console.error('❌ Error inicializando bot de Telegram:', err.message);
    bot = null;
    return null;
  }

  console.log('📲 Bot de Telegram conectado (chat_id:', chatId, ')');

  // ─── Comandos ─────────────────────────────────────────
  bot.onText(/\/start/, (msg) => {
    send(msg.chat.id, '🌎 *ULTRA SYSTEM* activo\\.\nUsa /help para ver comandos\\.', 'MarkdownV2');
  });

  bot.onText(/\/help/, (msg) => {
    const help = [
      '🤖 *Comandos disponibles:*',
      '',
      '/status — Estado general del sistema',
      '/docs — Documentos próximos a caducar',
      '/alertas — Historial de alertas enviadas',
      '/feeds — Últimas noticias',
      '/finanzas — Resumen financiero mensual',
      '/oportunidades — Oportunidades activas',
      '/logistica — Próximos 7 días',
      '/bio — Resumen semanal de salud',
      '/ping — Verificar que el bot funciona',
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

      const lines = ['📬 *Últimas alertas enviadas:*', ''];
      for (const log of logs) {
        const date = new Date(log.sent_at).toLocaleDateString('es-ES');
        lines.push(`${log.status === 'sent' ? '✅' : '❌'} ${date} — ${log.channel}`);
      }
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P3: Finanzas ─────────────────────────────────────
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

      // Top 3 categorias de gasto
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

  // ─── P5: Oportunidades ──────────────────────────────
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

  // ─── P6: Logistica ──────────────────────────────────
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
        send(msg.chat.id, '✅ Nada programado en los próximos 7 días.');
        return;
      }

      const typeEmoji = { transport: '🚌', accommodation: '🏠', visa: '🛂', appointment: '📋' };
      const lines = [
        '🗺️ *ULTRA SYSTEM — Logística (7 días)*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
      ];

      for (const item of items) {
        const emoji = typeEmoji[item.type] || '📌';
        const dateStr = new Date(item.date).toISOString().split('T')[0];
        const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';
        lines.push(`${emoji} ${statusIcon} *${item.title}*`);
        lines.push(`   📅 ${dateStr} (en ${item.days_until} días)`);
        if (item.location) lines.push(`   📍 ${item.location}`);
        lines.push('');
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  // ─── P7: Bio-Check ──────────────────────────────────
  bot.onText(/\/bio/, async (msg) => {
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

      // Barra visual simple para niveles 1-10
      const bar = (val) => {
        const filled = Math.round(parseFloat(val));
        return '█'.repeat(filled) + '░'.repeat(10 - filled);
      };

      const lines = [
        '🧬 *ULTRA SYSTEM — Bio-Check Semanal*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        `📊 Registros: ${weekly.entries}/7`,
        '',
        `😴 Sueño: ${weekly.avg_sleep}h`,
        `⚡ Energía: ${bar(weekly.avg_energy)} ${weekly.avg_energy}/10`,
        `😊 Ánimo: ${bar(weekly.avg_mood)} ${weekly.avg_mood}/10`,
        `🏃 Ejercicio: ${weekly.avg_exercise} min/día`,
        '━━━━━━━━━━━━━━━━━━━━━━━━',
      ];

      send(msg.chat.id, lines.join('\n'), 'Markdown');
    } catch (err) {
      send(msg.chat.id, `❌ Error: ${err.message}`);
    }
  });

  bot.on('polling_error', (err) => {
    console.error('❌ Telegram polling error:', err.code);
  });

  return bot;
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

const urgencyEmoji = (days) => {
  if (days <= 7) return '🔴';
  if (days <= 30) return '🟡';
  return '🟢';
};

/**
 * Formatea alertas de documentos (misma estética que el workflow original de n8n)
 */
function formatDocumentAlert(docs) {
  let message = '📋 *ULTRA SYSTEM — Alertas de Documentos*\n';
  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

  for (const d of docs) {
    const emoji = TYPE_EMOJI[d.document_type] || TYPE_EMOJI.default;
    const urgent = urgencyEmoji(d.days_remaining);
    const expDate = new Date(d.expiry_date).toISOString().split('T')[0];

    message += `${urgent} ${emoji} *${d.document_name}*\n`;
    message += `   ⏳ Caduca en: *${d.days_remaining} días* (${expDate})\n`;
    if (d.notes) message += `   💬 ${d.notes}\n`;
    message += '\n';
  }

  message += '━━━━━━━━━━━━━━━━━━━━━━━━\n';
  message += '🤖 _Enviado por Ultra Engine_';
  return message;
}

/**
 * Envía mensaje al chat configurado
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
 * Envía alerta al chat del usuario (para el scheduler)
 */
async function sendAlert(text, parseMode = 'Markdown') {
  await send(process.env.TELEGRAM_CHAT_ID, text, parseMode);
}

/**
 * Registra la notificación en la DB
 */
async function logNotification(alertId, message, status = 'sent') {
  try {
    await db.query(
      `INSERT INTO notification_log (alert_id, message, channel, status)
       VALUES ($1, $2, 'telegram', $3)`,
      [alertId, message, status]
    );
  } catch (err) {
    console.error('❌ Error registrando notificación:', err.message);
  }
}

module.exports = { init, send, sendAlert, logNotification, formatDocumentAlert };
