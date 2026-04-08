// ╔══════════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Servidor Principal                          ║
// ║                                                              ║
// ║  Un solo proceso Node.js que reemplaza:                     ║
// ║  • n8n (scheduler + lógica)                                 ║
// ║  • Paperless-ngx (OCR + gestión documental)                 ║
// ║  • Miniflux (RSS reader)                                    ║
// ║  • Changedetection.io (web scraper)                         ║
// ║  • Grafana (dashboard)                                      ║
// ║  • Homepage (panel central)                                 ║
// ║  • Redis (no necesario)                                     ║
// ║                                                              ║
// ║  Dependencia externa: SOLO PostgreSQL                       ║
// ╚══════════════════════════════════════════════════════════════╝

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const path = require('path');

const db = require('./src/db');
const telegram = require('./src/telegram');
const scheduler = require('./src/scheduler');
const bridges = require('./src/bridges');
const aisstream = require('./src/aisstream_subscriber');
const { apiKeyAuth } = require('./src/middleware/auth');
const { requireAuth } = require('./src/middleware/jwt-auth');

// ─── Rutas API ─────────────────────────────────────────────
const authRouter = require('./src/routes/auth');
const documentsRouter = require('./src/routes/documents');
const statusRouter = require('./src/routes/status');
const feedsRouter = require('./src/routes/feeds');
const jobsRouter = require('./src/routes/jobs');
const financesRouter = require('./src/routes/finances');
const opportunitiesRouter = require('./src/routes/opportunities');
const logisticsRouter = require('./src/routes/logistics');
const bioRouter = require('./src/routes/bio');
const bureaucracyRouter = require('./src/routes/bureaucracy');
const webhooksRouter = require('./src/routes/webhooks');
const agentBusRouter = require("./src/routes/agentbus");
const wmRouter = require('./src/routes/wm');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });

// ─── Archivos estáticos (Dashboard) ────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Routes (públicas) ───────────────────────────────
app.use('/api/auth', authRouter);

// ─── API Routes (protegidas con JWT) ──────────────────────
app.use('/api/documents', requireAuth, documentsRouter);
app.use('/api/status', requireAuth, statusRouter);
app.use('/api/feeds', requireAuth, feedsRouter);
app.use('/api/jobs', requireAuth, jobsRouter);
app.use('/api/finances', requireAuth, financesRouter);
app.use('/api/opportunities', requireAuth, opportunitiesRouter);
app.use('/api/logistics', requireAuth, logisticsRouter);
app.use('/api/bio', requireAuth, bioRouter);
app.use('/api/bureaucracy', requireAuth, bureaucracyRouter);
app.use("/api/agent-bus", apiKeyAuth, agentBusRouter);
app.use('/api/wm', requireAuth, wmRouter);

// ─── Webhooks (públicos, validados por shared secret) ────
app.use('/webhooks', webhooksRouter);
// ─── Public read-only API for map.html (sin JWT) ─────────
app.use('/api/public', webhooksRouter);

// ─── Health endpoint (publico, sin auth para monitoreo) ───
// Devuelve: estado DB, estado Telegram, pilares cargados, uptime
const startTime = Date.now();

app.get('/api/health', async (req, res) => {
  // Estado de PostgreSQL
  const dbHealth = await db.healthCheck();

  // Estado del bot de Telegram
  const telegramOk = telegram.isActive ? telegram.isActive() : false;

  // Verificar que los 7 pilares estan cargados (rutas registradas)
  const pillars = [
    { name: 'P1 Noticias', route: '/api/feeds', loaded: !!feedsRouter },
    { name: 'P2 Empleo', route: '/api/jobs', loaded: !!jobsRouter },
    { name: 'P3 Finanzas', route: '/api/finances', loaded: !!financesRouter },
    { name: 'P4 Burocracia', route: '/api/documents', loaded: !!documentsRouter },
    { name: 'P5 Oportunidades', route: '/api/opportunities', loaded: !!opportunitiesRouter },
    { name: 'P6 Logistica', route: '/api/logistics', loaded: !!logisticsRouter },
    { name: 'P7 Bio-Check', route: '/api/bio', loaded: !!bioRouter },
  ];
  const allPillarsLoaded = pillars.every(p => p.loaded);

  // Uptime del proceso
  const uptimeMs = Date.now() - startTime;
  const uptimeSec = Math.floor(uptimeMs / 1000);
  const uptimeHours = Math.floor(uptimeSec / 3600);
  const uptimeMinutes = Math.floor((uptimeSec % 3600) / 60);

  const health = {
    ok: dbHealth.ok && allPillarsLoaded,
    uptime: `${uptimeHours}h ${uptimeMinutes}m`,
    uptime_seconds: uptimeSec,
    db: {
      ok: dbHealth.ok,
      time: dbHealth.time || null,
      database: dbHealth.database || null,
      db_size: dbHealth.db_size || null,
      table_count: dbHealth.table_count || 0,
      error: dbHealth.error || null,
    },
    telegram: {
      ok: telegramOk,
    },
    pillars: {
      loaded: pillars.filter(p => p.loaded).length,
      total: 7,
      all_loaded: allPillarsLoaded,
      detail: pillars,
    },
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version,
    timestamp: new Date().toISOString(),
  };

  res.status(health.ok ? 200 : 503).json(health);
});

// ─── SPA Fallback (Dashboard) ──────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Iniciar servidor ──────────────────────────────────────
async function start() {
  process.stdout.write('\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🌎 ULTRA ENGINE — Sistema de Inteligencia Personal  ║');
  console.log('║     100% código propio · 0 servicios de terceros    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  process.stdout.write('\n');

  // 1. Verificar DB
  console.log('🗄️ Conectando a PostgreSQL...');
  const health = await db.healthCheck();
  if (!health.ok) {
    console.error('❌ No se pudo conectar a PostgreSQL:', health.error);
    console.error('   Asegúrate de que el contenedor de DB está corriendo');
    process.exit(1);
  }
  console.log('✅ PostgreSQL conectado');

  // 2. Iniciar Bot de Telegram
  console.log('📲 Iniciando bot de Telegram...');
  telegram.init();

  // 3. Iniciar Scheduler (cron jobs)
  console.log('⏰ Iniciando scheduler...');
  scheduler.init();

  // 3b. Iniciar bridges P3↔P5/P6 (event subscribers)
  bridges.init();

  // 3c. Iniciar AISstream WebSocket subscriber (P1 WM Phase 2 step 7).
  // Persistent connection to wss://stream.aisstream.io feeding
  // processAisPosition() of military-vessels.ts. No-op if
  // AISSTREAM_API_KEY is missing. Reconnect + duty cycle handled
  // internally by the subscriber.
  aisstream.start();

  // 4. Iniciar servidor HTTP
  app.listen(PORT, '0.0.0.0', () => {
    process.stdout.write('\n');
    console.log(`🚀 Ultra Engine corriendo en http://0.0.0.0:${PORT}`);
    console.log(`   Dashboard: http://localhost:${PORT}`);
    console.log(`   API:       http://localhost:${PORT}/api/status`);
    process.stdout.write('\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  Pilares activos:');
    console.log('    P1 📰 Noticias     — RSS Reader');
    console.log('    P2 💼 Empleo       — Web Scraper');
    console.log('    P3 💰 Finanzas     — Ingresos/Gastos');
    console.log('    P4 📂 Burocracia   — Guardián de Documentos + OCR');
    console.log('    P5 🎯 Oportunidades — Freelance/Ideas');
    console.log('    P6 🗺️ Logística    — Transporte/Alojamiento');
    console.log('    P7 🧬 Bio-Check    — Salud/Bienestar');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

start().catch((err) => {
  console.error('💥 Error fatal al iniciar Ultra Engine:', err);
  process.exit(1);
});
