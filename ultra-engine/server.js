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
const { apiKeyAuth } = require('./src/middleware/auth');

// ─── Rutas API ─────────────────────────────────────────────
const documentsRouter = require('./src/routes/documents');
const statusRouter = require('./src/routes/status');
const feedsRouter = require('./src/routes/feeds');
const jobsRouter = require('./src/routes/jobs');
const financesRouter = require('./src/routes/finances');
const opportunitiesRouter = require('./src/routes/opportunities');
const logisticsRouter = require('./src/routes/logistics');
const bioRouter = require('./src/routes/bio');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Archivos estáticos (Dashboard) ────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes (protegidas con API key) ──────────────────
app.use('/api/documents', apiKeyAuth, documentsRouter);
app.use('/api/status', apiKeyAuth, statusRouter);
app.use('/api/feeds', apiKeyAuth, feedsRouter);
app.use('/api/jobs', apiKeyAuth, jobsRouter);
app.use('/api/finances', apiKeyAuth, financesRouter);
app.use('/api/opportunities', apiKeyAuth, opportunitiesRouter);
app.use('/api/logistics', apiKeyAuth, logisticsRouter);
app.use('/api/bio', apiKeyAuth, bioRouter);

// ─── Health endpoint (público, sin auth para monitoreo) ───
app.get('/api/health', async (req, res) => {
  const health = await db.healthCheck();
  res.status(health.ok ? 200 : 503).json(health);
});

// ─── SPA Fallback (Dashboard) ──────────────────────────────
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Iniciar servidor ──────────────────────────────────────
async function start() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🌎 ULTRA ENGINE — Sistema de Inteligencia Personal  ║');
  console.log('║     100% código propio · 0 servicios de terceros    ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

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

  // 4. Iniciar servidor HTTP
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log(`🚀 Ultra Engine corriendo en http://0.0.0.0:${PORT}`);
    console.log(`   Dashboard: http://localhost:${PORT}`);
    console.log(`   API:       http://localhost:${PORT}/api/status`);
    console.log('');
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
