// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Módulo de Base de Datos                  ║
// ║  Pool de conexiones PostgreSQL + helpers                 ║
// ╚══════════════════════════════════════════════════════════╝

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'ultra_db',
  user: process.env.POSTGRES_USER || 'ultra_user',
  password: process.env.POSTGRES_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('❌ Error inesperado en pool de PostgreSQL:', err);
});

/**
 * Ejecuta una query con parámetros
 * @param {string} text — SQL query
 * @param {Array} params — Parámetros para la query
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`⚠️ Query lenta (${duration}ms):`, text.substring(0, 80));
  }
  return result;
}

/**
 * Obtiene una fila única
 */
async function queryOne(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/**
 * Obtiene múltiples filas
 */
async function queryAll(text, params) {
  const result = await query(text, params);
  return result.rows;
}

/**
 * Verifica que la conexion funciona y devuelve info detallada
 * Usado por /api/health y por el bot de Telegram
 */
async function healthCheck() {
  try {
    const result = await query('SELECT NOW() as time, current_database() as database, pg_size_pretty(pg_database_size(current_database())) as db_size');
    // Verificar que las tablas principales existen
    const tables = await query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name`
    );
    const tableNames = tables.rows.map(r => r.table_name);
    return {
      ok: true,
      time: result.rows[0].time,
      database: result.rows[0].database,
      db_size: result.rows[0].db_size,
      tables: tableNames,
      table_count: tableNames.length,
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { pool, query, queryOne, queryAll, healthCheck };
