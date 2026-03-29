// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bot de Telegram                          ║
// ║  Reemplaza n8n para envio de alertas + comandos          ║
// ║  Comandos smart: budget, pipeline, bio, logistica        ║
// ╚══════════════════════════════════════════════════════════╝

const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');
const { pearson } = require('./utils/pearson');

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

  bot.on('polling_error', (err) => {
    console.error('❌ Telegram polling error:', err.code);
  });

  return bot;
}

// ═══════════════════════════════════════════════════════════
//  UTILIDADES
// ═══════════════════════════════════════════════════════════

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

module.exports = { init, send, sendAlert, logNotification, formatDocumentAlert, isActive };
