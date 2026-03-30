// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Scheduler (reemplaza n8n)                ║
// ║  Cron jobs propios para todos los pilares                ║
// ║  Smart: budget alerts, pipeline reminders, bio weekly    ║
// ╚══════════════════════════════════════════════════════════╝

const cron = require('node-cron');
const db = require('./db');
const telegram = require('./telegram');
const freelanceScraper = require('./freelance_scraper');
const { pearson: pearsonCorr } = require('./utils/pearson');
const { BIO_WEEKLY_SQL, BIO_CORRELATION_SQL } = require('./utils/bio_queries');
const {
  formatBudgetAlert,
  formatOpportunityReminders,
  formatLogisticsNext48h,
  formatBioWeeklySummary,
} = require('./utils/scheduler_format');
const { calculateRunway, BUDGET_ALERTS_SQL } = require('./utils/budget_calc');
const { toDateStr } = require('./utils/date_format');

const jobs = [];

/**
 * Inicializa todos los cron jobs
 */
function init() {
  console.debug('⏰ Iniciando scheduler...');

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
  // ─── P5: Oportunidades — Scrape freelance cada 12 horas ───
  register(
    'freelance-scrape',
    '0 */12 * * *',
    scrapeFreelanceOpportunities,
    'Cada 12 horas — Buscar oportunidades freelance'
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

  console.debug(`✅ ${jobs.length} jobs registrados`);
}

/**
 * Registra un cron job
 */
function register(name, schedule, handler, description) {
  const tz = process.env.TZ || 'UTC';
  const job = cron.schedule(schedule, async () => {
    const start = Date.now();
    console.debug(`🔄 [${name}] Ejecutando...`);
    try {
      await handler();
      const duration = Date.now() - start;
      console.debug(`✅ [${name}] Completado en ${duration}ms`);
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
    console.debug('✅ Sin documentos por caducar');
    return;
  }

  const message = telegram.formatDocumentAlert(docs);
  await telegram.sendAlert(message);
  await telegram.logNotification(docs[0].id, message, 'sent');

  console.debug(`📲 Alerta enviada: ${docs.length} documentos`);
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
    const expDate = toDateStr(d.expiry_date);
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

    console.debug(`📰 RSS: ${totalNew} nuevos, ${highScoreArticles.length} alertados`);
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
  } catch (err) {
    console.warn('⚠️ Job scrape falló:', err.message);
  }
}

/**
 * P3: Verifica budgets que exceden 80% del limite y alerta
 */
async function checkBudgetAlerts() {
  const month = new Date().toISOString().slice(0, 7);

  const alerts = await db.queryAll(BUDGET_ALERTS_SQL, [month]);

  if (!alerts.length) {
    console.debug('✅ Sin alertas de presupuesto');
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
  const dayOfMonth = new Date().getDate();
  const { remaining, runway } = calculateRunway(income, expense, dayOfMonth);

  const lines = formatBudgetAlert({ month, remaining, runway, alerts });
  await telegram.sendAlert(lines.join('\n'));

  console.debug(`📲 ${alerts.length} alertas de presupuesto enviadas`);
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
    console.debug('✅ Sin recordatorios de oportunidades');
    return;
  }

  const lines = formatOpportunityReminders({ deadlines, followUps });
  await telegram.sendAlert(lines.join('\n'));

  console.debug(`📲 Recordatorios: ${deadlines.length} deadlines, ${followUps.length} follow-ups`);
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
    console.debug('✅ Sin items de logistica en 48h');
    return;
  }

  const lines = formatLogisticsNext48h(items);
  await telegram.sendAlert(lines.join('\n'));

  console.debug(`📲 ${items.length} items de logistica alertados`);
}

/**
 * P7: Resumen bio semanal con promedios y correlaciones
 * Se ejecuta domingo a las 20:00
 */
async function sendBioWeeklySummary() {
  const weekly = await db.queryOne(BIO_WEEKLY_SQL);

  if (!weekly || parseInt(weekly.entries) === 0) {
    console.debug('📭 Sin registros bio esta semana');
    return;
  }

  // Correlaciones (ultimos 30 dias)
  const data = await db.queryAll(BIO_CORRELATION_SQL);

  let correlations = null;
  if (data.length >= 3) {
    const sleep = data.map(d => parseFloat(d.sleep_hours));
    const energy = data.map(d => parseInt(d.energy_level));
    const mood = data.map(d => parseInt(d.mood));
    const exercise = data.map(d => parseInt(d.exercise_minutes));

    correlations = [
      { label: 'Sueno → Energia', val: pearsonCorr(sleep, energy) },
      { label: 'Sueno → Animo', val: pearsonCorr(sleep, mood) },
      { label: 'Ejercicio → Energia', val: pearsonCorr(exercise, energy) },
    ];
  }

  const lines = formatBioWeeklySummary({ weekly, correlations });
  await telegram.sendAlert(lines.join('\n'));

  console.debug('📲 Resumen bio semanal enviado');
}

/**
 * P5: Scrape Freelancer.com para oportunidades relevantes
 */
async function scrapeFreelanceOpportunities() {
  try {
    const { totalNew, highScoreProjects } = await freelanceScraper.fetchAll();
    console.debug(`🎯 Freelancer: ${totalNew} nuevas, ${highScoreProjects.length} de alto score`);
  } catch (err) {
    console.warn('⚠️ Freelance scrape falló:', err.message);
  }
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
