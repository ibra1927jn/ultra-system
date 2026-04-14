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
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./src/db');
const telegram = require('./src/telegram');
const scheduler = require('./src/scheduler');
const bridges = require('./src/bridges');
const crossPillarBridges = require('./src/cross_pillar_bridges');
const aisstream = require('./src/aisstream_subscriber');
const bskyJetstream = require('./src/bsky_jetstream');
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
// trust loopback / docker bridge (compose port bind is 127.0.0.1:80:3000
// + internal container-to-container, so trust=1 is safe and makes
// express-rate-limit derive the real client from X-Forwarded-For/remote).
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false, // dashboard usa inline styles + google fonts
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
// Lightweight cookie parser (no external dependency)
app.use((req, _res, next) => {
  req.cookies = {};
  const hdr = req.headers.cookie;
  if (hdr) hdr.split(';').forEach(c => { const [k, ...v] = c.split('='); req.cookies[k.trim()] = v.join('=').trim(); });
  next();
});
app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate'); next(); });

// ─── Rate limits ───────────────────────────────────────────
// Login: 5 intentos/min por IP (bruteforce defense).
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts' },
});
// Webhooks: 60/min por IP (cdio/bsky/telethon legítimos caben holgados).
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Webhook rate limit' },
});

// ─── Archivos estáticos (Dashboard) ────────────────────────
// login.html + CSS/JS/fonts always public (needed for login page).
// index.html and other HTML pages require auth (cookie or Bearer).
app.use('/login.html', express.static(path.join(__dirname, 'public', 'login.html')));
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/js', express.static(path.join(__dirname, 'public', 'js')));
app.use('/sw.js', express.static(path.join(__dirname, 'public', 'sw.js')));
// Protected static: HTML files require auth
app.use((req, res, next) => {
  // Allow non-HTML static assets through
  if (req.path.match(/\.(css|js|png|jpg|svg|ico|woff2?|ttf|json)$/)) {
    return express.static(path.join(__dirname, 'public'))(req, res, next);
  }
  // HTML paths: require auth
  next();
});

// ─── Auth Routes (públicas, rate-limited en login) ───────
app.use('/api/auth/login', loginLimiter);
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
// Map endpoints: cookie auth (dashboard) OR API key (agents)
const wmAuth = (req, res, next) => {
  // Dashboard (cookie JWT) OR external agents (API key)
  if (req.headers['x-api-key']) return apiKeyAuth(req, res, next);
  return requireAuth(req, res, next);
};
app.use('/api/wm', wmAuth, wmRouter);

// ─── Webhooks (públicos, validados por shared secret + rate-limited) ──
app.use('/webhooks', webhookLimiter, webhooksRouter);
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

  // Health público mínimo — nada de métricas sensibles (db_size, table_count,
  // uptime exacto, versión node, nombre db, lista de pilares). Solo lo
  // imprescindible para un uptime checker externo.
  const health = {
    ok: dbHealth.ok && allPillarsLoaded,
    db: dbHealth.ok,
    telegram: telegramOk,
    pillars_ok: allPillarsLoaded,
  };

  res.status(health.ok ? 200 : 503).json(health);
});

// ─── World Map (dedicated page) ─────────────────────────────
app.get('/worldmap.html', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'worldmap.html'));
});

// ─── SPA Fallback (Dashboard) ──────────────────────────────
// Protected: must be logged in (cookie or Bearer) to access dashboard
app.get('/{*path}', requireAuth, (req, res) => {
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

  // 3b'. B6 — Cross-pillar news bridges (rss.js news.cpi → telegram P2/P3/P4/P5)
  crossPillarBridges.init();

  // 3c. Iniciar AISstream WebSocket subscriber (P1 WM Phase 2 step 7).
  // Persistent connection to wss://stream.aisstream.io feeding
  // processAisPosition() of military-vessels.ts. No-op if
  // AISSTREAM_API_KEY is missing. Reconnect + duty cycle handled
  // internally by the subscriber.
  aisstream.start();

  // 3d. Bluesky Jetstream WebSocket subscriber (P1 Lote A B7).
  // Sustituye el polling REST hourly. Persistent firehose con keyword
  // matching in-memory. Reconnect interno con backoff.
  bskyJetstream.start().catch(err =>
    console.error('❌ bsky jetstream start failed:', err.message)
  );

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
