// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Scheduler (reemplaza n8n)                ║
// ║  Cron jobs propios para todos los pilares                ║
// ║  Smart: budget alerts, pipeline reminders, bio weekly    ║
// ╚══════════════════════════════════════════════════════════╝

const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');

const jobs = [];

/**
 * Inicializa todos los cron jobs
 */
function init() {
  console.log('⏰ Iniciando scheduler...');

  // ─── P4: Burocracia — Alerta documentos cada lunes 09:00 ───
  register(
    'document-expiry-check',
    '0 9 * * 1',
    checkDocumentExpiry,
    'Lunes 09:00 — Chequear documentos por caducar'
  );

  // ─── P4: Burocracia — Alerta diaria urgente (docs < 7 dias) ───
  register(
    'urgent-document-check',
    '0 8 * * *',
    checkUrgentDocuments,
    'Diario 08:00 — Alertas urgentes (<7 dias)'
  );

  // ─── P1: Noticias — Fetch RSS cada 30 min con scoring ───
  register(
    'rss-fetch',
    '*/30 * * * *',
    fetchRssFeeds,
    'Cada 30 min — Buscar noticias + scoring keywords'
  );

  // ─── P2: Empleo — Scrape webs cada 6 horas ───
  register(
    'job-scrape',
    '0 */6 * * *',
    scrapeJobSources,
    'Cada 6 horas — Buscar ofertas de empleo'
  );

  // ─── P3: Finanzas — Budget alerts diario 09:00 ───
  register(
    'budget-alerts',
    '0 9 * * *',
    checkBudgetAlerts,
    'Diario 09:00 — Alertas de presupuesto (>80%)'
  );

  // ─── P5: Oportunidades — Deadline + follow-up diario 09:00 ───
  register(
    'opportunity-reminders',
    '5 9 * * *',
    checkOpportunityReminders,
    'Diario 09:05 — Deadlines proximos + follow-ups'
  );

  // ─── P6: Logistica — Proximas 48h diario 08:00 ───
  register(
    'logistics-next48h',
    '0 8 * * *',
    checkLogisticsNext48h,
    'Diario 08:00 — Items en las proximas 48 horas'
  );

  // ─── P7: Bio-Check — Resumen semanal domingo 20:00 ───
  register(
    'bio-weekly-summary',
    '0 20 * * 0',
    sendBioWeeklySummary,
    'Domingo 20:00 — Resumen bio semanal + correlaciones'
  );

  // ─── Health check — Cada hora ───
  register(
    'health-ping',
    '0 * * * *',
    healthPing,
    'Cada hora — Health check interno'
  );

  console.log(`✅ ${jobs.length} jobs registrados`);
}

/**
 * Registra un cron job
 */
function register(name, schedule, handler, description) {
  const tz = process.env.TZ || 'UTC';
  const job = cron.schedule(schedule, async () => {
    const start = Date.now();
    console.log(`🔄 [${name}] Ejecutando...`);
    try {
      await handler();
      const duration = Date.now() - start;
      console.log(`✅ [${name}] Completado en ${duration}ms`);
      await logJob(name, 'success', duration);
    } catch (err) {
      console.error(`❌ [${name}] Error:`, err.message);
      await logJob(name, 'error', Date.now() - start, err.message);
    }
  }, { timezone: tz });

  jobs.push({ name, schedule, description, job });
}

/**
 * Registra ejecucion del job en DB
 */
async function logJob(name, status, durationMs, error = null) {
  try {
    await db.query(
      `INSERT INTO scheduler_log (job_name, status, duration_ms, error_message)
       VALUES ($1, $2, $3, $4)`,
      [name, status, durationMs, error]
    );
  } catch (err) {
    console.error('❌ Error registrando job:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  JOB HANDLERS
// ═══════════════════════════════════════════════════════════

/**
 * P4: Chequea documentos proximos a caducar y envia alerta
 */
async function checkDocumentExpiry() {
  const docs = await db.queryAll(
    `SELECT id, document_name, document_type, expiry_date, alert_days, notes,
     (expiry_date - CURRENT_DATE) AS days_remaining
     FROM document_alerts
     WHERE is_active = TRUE
       AND (expiry_date - CURRENT_DATE) <= alert_days
       AND (expiry_date - CURRENT_DATE) >= 0
     ORDER BY days_remaining ASC`
  );

  if (!docs.length) {
    console.log('✅ Sin documentos por caducar');
    return;
  }

  const message = telegram.formatDocumentAlert(docs);
  await telegram.sendAlert(message);
  await telegram.logNotification(docs[0].id, message, 'sent');

  console.log(`📲 Alerta enviada: ${docs.length} documentos`);
}

/**
 * P4: Alerta urgente para docs a punto de caducar (<7 dias)
 */
async function checkUrgentDocuments() {
  const docs = await db.queryAll(
    `SELECT id, document_name, document_type, expiry_date, notes,
     (expiry_date - CURRENT_DATE) AS days_remaining
     FROM document_alerts
     WHERE is_active = TRUE
       AND (expiry_date - CURRENT_DATE) <= 7
       AND (expiry_date - CURRENT_DATE) >= 0
     ORDER BY days_remaining ASC`
  );

  if (!docs.length) return;

  let msg = '🚨 *ALERTA URGENTE — Documentos a punto de caducar*\n\n';
  for (const d of docs) {
    const expDate = new Date(d.expiry_date).toISOString().split('T')[0];
    msg += `🔴 *${d.document_name}* — ${d.days_remaining} dias (${expDate})\n`;
  }
  await telegram.sendAlert(msg);
}

/**
 * P1: Fetch RSS feeds con scoring por keywords
 * Alerta via Telegram si hay articulos de alta relevancia
 */
async function fetchRssFeeds() {
  try {
    const rss = require('./rss');
    const { totalNew, highScoreArticles } = await rss.fetchAll();

    // Alertar via Telegram si hay articulos relevantes
    if (highScoreArticles.length > 0) {
      const lines = [
        '📰 *ULTRA SYSTEM — Noticias Relevantes*',
        '━━━━━━━━━━━━━━━━━━━━━━━━',
        '',
      ];

      for (const article of highScoreArticles.slice(0, 5)) {
        lines.push(`⭐ *${article.title}*`);
        lines.push(`   📊 Score: ${article.score} | 📰 ${article.feed}`);
        lines.push(`   🔗 ${article.url}`);
        lines.push('');
      }

      if (highScoreArticles.length > 5) {
        lines.push(`... y ${highScoreArticles.length - 5} mas`);
      }

      lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
      await telegram.sendAlert(lines.join('\n'));
    }

    console.log(`📰 RSS: ${totalNew} nuevos, ${highScoreArticles.length} alertados`);
  } catch (err) {
    // Modulo P1 puede no estar listo
    console.warn('⚠️ RSS fetch falló:', err.message);
  }
}

/**
 * P2: Scrape fuentes de empleo (stub — se implementara con scraper.js)
 */
async function scrapeJobSources() {
  try {
    const scraper = require('./scraper');
    await scraper.checkAll();
  } catch {
    // Module P2 aun no activo
  }
}

/**
 * P3: Verifica budgets que exceden 80% del limite y alerta
 */
async function checkBudgetAlerts() {
  const month = new Date().toISOString().slice(0, 7);

  const alerts = await db.queryAll(
    `SELECT
       b.category,
       b.monthly_limit,
       COALESCE(SUM(f.amount), 0) as spent,
       ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1) as percent_used
     FROM budgets b
     LEFT JOIN finances f ON LOWER(f.category) = LOWER(b.category)
       AND f.type = 'expense'
       AND TO_CHAR(f.date, 'YYYY-MM') = $1
     GROUP BY b.category, b.monthly_limit
     HAVING COALESCE(SUM(f.amount), 0) >= b.monthly_limit * 0.8
     ORDER BY percent_used DESC`,
    [month]
  );

  if (!alerts.length) {
    console.log('✅ Sin alertas de presupuesto');
    return;
  }

  // Calcular runway tambien
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
  const dayOfMonth = new Date().getDate();
  const dailyBurn = dayOfMonth > 0 ? expense / dayOfMonth : 0;
  const runway = dailyBurn > 0 ? Math.floor(remaining / dailyBurn) : 999;

  const lines = [
    '⚠️ *ULTRA SYSTEM — Alerta de Presupuesto*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📅 ${month} | 💵 Restante: $${remaining.toFixed(2)} | ⏳ Runway: ${runway} dias`,
    '',
  ];

  for (const a of alerts) {
    const emoji = parseFloat(a.percent_used) >= 100 ? '🔴' : '🟡';
    lines.push(`${emoji} *${a.category}*: $${parseFloat(a.spent).toFixed(2)} / $${parseFloat(a.monthly_limit).toFixed(2)} (${a.percent_used}%)`);
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 ${alerts.length} alertas de presupuesto enviadas`);
}

/**
 * P5: Verifica deadlines proximos y follow-ups pendientes
 */
async function checkOpportunityReminders() {
  // Deadlines en los proximos 3 dias
  const deadlines = await db.queryAll(
    `SELECT id, title, deadline, status,
       (deadline - CURRENT_DATE) as days_until
     FROM opportunities
     WHERE deadline IS NOT NULL
       AND deadline >= CURRENT_DATE
       AND deadline <= CURRENT_DATE + 3
       AND status NOT IN ('rejected', 'won')
     ORDER BY deadline ASC`
  );

  // Follow-ups necesarios (contacted >7 dias)
  const followUps = await db.queryAll(
    `SELECT id, title, source,
       (CURRENT_DATE - created_at::date) as days_since
     FROM opportunities
     WHERE status = 'contacted'
       AND created_at < NOW() - INTERVAL '7 days'
     ORDER BY created_at ASC`
  );

  if (!deadlines.length && !followUps.length) {
    console.log('✅ Sin recordatorios de oportunidades');
    return;
  }

  const lines = [
    '🎯 *ULTRA SYSTEM — Recordatorios*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  if (deadlines.length) {
    lines.push('', '📅 *Deadlines proximos:*');
    for (const d of deadlines) {
      const urgency = d.days_until === 0 ? '🔴 HOY' : d.days_until === 1 ? '🟡 MANANA' : `🟢 en ${d.days_until} dias`;
      lines.push(`   ${urgency} — *${d.title}*`);
    }
  }

  if (followUps.length) {
    lines.push('', '📧 *Necesitan follow-up (>7 dias):*');
    for (const f of followUps) {
      lines.push(`   ⏰ *${f.title}* — ${f.days_since} dias sin respuesta`);
      if (f.source) lines.push(`      📍 ${f.source}`);
    }
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 Recordatorios: ${deadlines.length} deadlines, ${followUps.length} follow-ups`);
}

/**
 * P6: Alerta de items de logistica en las proximas 48 horas
 */
async function checkLogisticsNext48h() {
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
    console.log('✅ Sin items de logistica en 48h');
    return;
  }

  const typeEmoji = { transport: '🚌', accommodation: '🏠', visa: '🛂', appointment: '📋' };
  const urgencyMap = { 0: '🔴 HOY', 1: '🟡 MANANA', 2: '🟢 Pasado manana' };

  const lines = [
    '🗺️ *ULTRA SYSTEM — Logistica 48h*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const item of items) {
    const emoji = typeEmoji[item.type] || '📌';
    const urgency = urgencyMap[item.days_until] || '📌';
    const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';

    lines.push(`${urgency} ${emoji} ${statusIcon} *${item.title}*`);
    if (item.location) lines.push(`   📍 ${item.location}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  await telegram.sendAlert(lines.join('\n'));

  console.log(`📲 ${items.length} items de logistica alertados`);
}

/**
 * P7: Resumen bio semanal con promedios y correlaciones
 * Se ejecuta domingo a las 20:00
 */
async function sendBioWeeklySummary() {
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
    console.log('📭 Sin registros bio esta semana');
    return;
  }

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

  // Alertas de valores bajos
  const avgSleep = parseFloat(weekly.avg_sleep);
  const avgEnergy = parseFloat(weekly.avg_energy);
  const avgMood = parseFloat(weekly.avg_mood);

  if (avgSleep < 6) lines.push('', `⚠️ Sueno bajo (${avgSleep}h) — prioriza descanso`);
  if (avgEnergy < 4) lines.push(`⚠️ Energia baja (${avgEnergy}/10) — revisa alimentacion`);
  if (avgMood < 4) lines.push(`⚠️ Animo bajo (${avgMood}/10) — considera un descanso`);

  // Correlaciones (ultimos 30 dias)
  const data = await db.queryAll(
    `SELECT sleep_hours, energy_level, mood, exercise_minutes
     FROM bio_checks WHERE date >= CURRENT_DATE - 30 ORDER BY date DESC`
  );

  if (data.length >= 3) {
    const sleep = data.map(d => parseFloat(d.sleep_hours));
    const energy = data.map(d => parseInt(d.energy_level));
    const mood = data.map(d => parseInt(d.mood));
    const exercise = data.map(d => parseInt(d.exercise_minutes));

    const corrs = [
      { label: 'Sueno → Energia', val: pearsonCorr(sleep, energy) },
      { label: 'Sueno → Animo', val: pearsonCorr(sleep, mood) },
      { label: 'Ejercicio → Energia', val: pearsonCorr(exercise, energy) },
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
  lines.push('🤖 _Enviado por Ultra Engine_');
  await telegram.sendAlert(lines.join('\n'));

  console.log('📲 Resumen bio semanal enviado');
}

/**
 * Health ping — verifica DB y registra
 */
async function healthPing() {
  const health = await db.healthCheck();
  if (!health.ok) {
    console.error('❌ Health check fallido:', health.error);
    await telegram.sendAlert('🚨 *ALERTA:* Base de datos no responde\\!');
  }
}

// ═══════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════

/**
 * Correlacion de Pearson (duplicada del modulo bio para independencia)
 */
function pearsonCorr(x, y) {
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

/**
 * Retorna lista de jobs para el dashboard
 */
function listJobs() {
  return jobs.map((j) => ({
    name: j.name,
    schedule: j.schedule,
    description: j.description,
  }));
}

module.exports = { init, listJobs };
