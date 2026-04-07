// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — External Self-Hosted Health Services (P7) ║
// ║                                                          ║
// ║  Health probes para los 4 containers self-hosted del      ║
// ║  Pilar 7 (decisión del usuario 2026-04-07: Opción B):    ║
// ║                                                          ║
// ║   • wger    (8001) — fitness tracker                     ║
// ║   • mealie  (8002) — recetas + meal planning             ║
// ║   • grocy   (8003) — despensa van + expiry               ║
// ║   • fasten  (8004) — personal health record vault         ║
// ║                                                          ║
// ║  Cada container expone un endpoint healthcheck distinto. ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const { Agent } = require('undici');

// Dispatcher que acepta self-signed certs (necesario para fasten que genera
// sus propios CA + server certs en runtime).
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

// Endpoints de health probe específicos por servicio
// fasten usa HTTPS auto-generado → status 200 ahora dentro de standby también
const PROBES = {
  wger:   { path: '/api/v2/exerciseinfo/?limit=1', expect200: false },
  mealie: { path: '/api/app/about', expect200: true },
  grocy:  { path: '/manifest.json', expect200: false },
  fasten: { path: '/web/auth/signin', expect200: false, insecure: true },
  spacy:  { path: '/health', expect200: true },
};

/**
 * Probea un servicio HTTP por su URL interna (Docker network).
 * Si el container no está corriendo o no responde → status -1.
 */
async function probe(serviceName) {
  const svc = await db.queryOne(
    'SELECT * FROM external_health_services WHERE name = $1',
    [serviceName]
  );
  if (!svc) return { ok: false, error: 'Service no registrado' };

  const probeCfg = PROBES[serviceName] || { path: '/', expect200: false };
  const url = `${svc.internal_url}${probeCfg.path}`;
  let status = -1;

  try {
    const fetchOpts = {
      headers: { 'User-Agent': 'UltraSystem/1.0 healthprobe' },
      signal: AbortSignal.timeout(5000),
    };
    if (probeCfg.insecure) fetchOpts.dispatcher = insecureAgent;
    const res = await fetch(url, fetchOpts);
    status = res.status;
  } catch (err) {
    status = -1;
  }

  await db.query(
    `UPDATE external_health_services SET last_probe = NOW(), last_status = $1 WHERE name = $2`,
    [status, serviceName]
  );

  const ok = probeCfg.expect200 ? status === 200 : status > 0 && status < 500;
  return { service: serviceName, status, ok, url };
}

/**
 * Probea los 4 servicios + actualiza last_probe en DB.
 */
async function probeAll() {
  const services = await db.queryAll(
    'SELECT name FROM external_health_services WHERE is_active = TRUE'
  );
  const results = [];
  for (const { name } of services) {
    results.push(await probe(name));
  }
  return results;
}

/**
 * Status agregado para Telegram/dashboard.
 */
async function getStatus() {
  const rows = await db.queryAll(
    `SELECT name, container, internal_url, external_port, purpose,
            last_probe, last_status,
            CASE
              WHEN last_status = 200 THEN 'healthy'
              WHEN last_status BETWEEN 1 AND 499 THEN 'degraded'
              WHEN last_status = -1 THEN 'down'
              ELSE 'unknown'
            END AS health
     FROM external_health_services
     WHERE is_active = TRUE
     ORDER BY external_port`
  );
  return rows;
}

module.exports = { probe, probeAll, getStatus, PROBES };
