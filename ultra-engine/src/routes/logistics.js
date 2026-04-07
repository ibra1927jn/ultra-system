// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Logistica (P6)                      ║
// ║  Gestion transporte/alojamiento + alertas 48h + costos   ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── GET /api/logistics ─ Listar items ──────────────────
router.get('/', async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    let sql = 'SELECT * FROM logistics WHERE 1=1';
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY date ASC';
    params.push(parseInt(limit) || 50);
    sql += ` LIMIT $${params.length}`;

    const rows = await db.queryAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/upcoming ─ Proximos 7 dias ──────
router.get('/upcoming', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT *, (date - CURRENT_DATE) AS days_until
       FROM logistics
       WHERE date >= CURRENT_DATE
       AND date <= CURRENT_DATE + INTERVAL '7 days'
       AND status != 'done'
       ORDER BY date ASC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  SMART ALERTS — Proximas 48 horas con urgencia
// ═══════════════════════════════════════════════════════════

// ─── GET /api/logistics/next48h ─ Items en 48 horas ─────
router.get('/next48h', async (req, res) => {
  try {
    const items = await db.queryAll(
      `SELECT *,
         (date - CURRENT_DATE) AS days_until,
         CASE
           WHEN (date - CURRENT_DATE) = 0 THEN 'critical'
           WHEN (date - CURRENT_DATE) = 1 THEN 'urgent'
           ELSE 'upcoming'
         END as urgency
       FROM logistics
       WHERE date >= CURRENT_DATE
         AND date <= CURRENT_DATE + INTERVAL '2 days'
         AND status != 'done'
       ORDER BY date ASC`
    );

    res.json({
      ok: true,
      data: items,
      count: items.length,
      summary: {
        critical: items.filter(i => i.urgency === 'critical').length,
        urgent: items.filter(i => i.urgency === 'urgent').length,
        upcoming: items.filter(i => i.urgency === 'upcoming').length,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/costs ─ Gastos por ubicacion/tipo ─
router.get('/costs', async (req, res) => {
  try {
    // Gastos agrupados por tipo
    const byType = await db.queryAll(
      `SELECT type,
         COUNT(*) as count,
         COALESCE(SUM(cost), 0) as total_cost,
         ROUND(COALESCE(AVG(cost), 0)::numeric, 2) as avg_cost
       FROM logistics
       WHERE cost > 0
       GROUP BY type
       ORDER BY total_cost DESC`
    );

    // Gastos agrupados por ubicacion
    const byLocation = await db.queryAll(
      `SELECT
         COALESCE(location, 'Sin ubicacion') as location,
         COUNT(*) as count,
         COALESCE(SUM(cost), 0) as total_cost
       FROM logistics
       WHERE cost > 0
       GROUP BY location
       ORDER BY total_cost DESC`
    );

    // Total general
    const totals = await db.queryOne(
      `SELECT
         COUNT(*) as total_items,
         COALESCE(SUM(cost), 0) as total_cost,
         ROUND(COALESCE(AVG(cost), 0)::numeric, 2) as avg_cost
       FROM logistics
       WHERE cost > 0`
    );

    res.json({
      ok: true,
      data: {
        by_type: byType,
        by_location: byLocation,
        totals: {
          items: parseInt(totals.total_items),
          total_cost: parseFloat(totals.total_cost),
          avg_cost: parseFloat(totals.avg_cost),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics ─ Crear item ───────────────────
router.post('/', async (req, res) => {
  try {
    const { type, title, date, location, notes, status, cost } = req.body;

    if (!type || !title || !date) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: type, title, date' });
    }

    const validTypes = ['transport', 'accommodation', 'visa', 'appointment'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: 'type debe ser transport, accommodation, visa o appointment' });
    }

    const validStatuses = ['pending', 'confirmed', 'done'];
    const finalStatus = validStatuses.includes(status) ? status : 'pending';

    const result = await db.queryOne(
      `INSERT INTO logistics (type, title, date, location, notes, status, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [type, title, date, location || null, notes || null, finalStatus, parseFloat(cost) || 0]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/logistics/:id ─ Actualizar item ─────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, date, location, notes, status, cost } = req.body;

    const result = await db.queryOne(
      `UPDATE logistics SET
       type = COALESCE($1, type),
       title = COALESCE($2, title),
       date = COALESCE($3, date),
       location = COALESCE($4, location),
       notes = COALESCE($5, notes),
       status = COALESCE($6, status),
       cost = COALESCE($7, cost)
       WHERE id = $8
       RETURNING *`,
      [type, title, date, location, notes, status, cost != null ? parseFloat(cost) : null, id]
    );

    if (!result) return res.status(404).json({ ok: false, error: 'Item no encontrado' });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P6 Phase 1 Quick Win — POI / Weather / Memberships / Kiwi
// ═══════════════════════════════════════════════════════════
const overpass = require('../overpass');
const weatherMod = require('../weather');
const docNz = require('../doc_nz');
const kiwi = require('../kiwi');

// ─── GET /api/logistics/poi ─ POIs cerca ─────────────────
// ?lat=&lon=&radius_km=&type=campsite|water|dump_station|...&refresh=true
router.get('/poi', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius_km || 20);
    const poiType = req.query.type || null;
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ ok: false, error: 'lat y lon requeridos (numeric)' });
    }
    // Si refresh=true, fuerza fetch de Overpass para los tipos relevantes
    let fetched = null;
    if (req.query.refresh === 'true' && poiType) {
      fetched = await overpass.fetchNearby(lat, lon, poiType, radius);
    }
    const rows = await overpass.listNearby(lat, lon, radius, poiType);
    res.json({ ok: true, count: rows.length, fetched, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics/poi/refresh ─ Fetch + cache ─────
router.post('/poi/refresh', async (req, res) => {
  try {
    const { lat, lon, types, radius_km = 20 } = req.body;
    if (!lat || !lon) return res.status(400).json({ ok: false, error: 'lat/lon requeridos' });
    const wantedTypes = types || ['campsite', 'water', 'dump_station', 'fuel'];
    const results = {};
    for (const t of wantedTypes) {
      try {
        results[t] = await overpass.fetchNearby(lat, lon, t, radius_km);
      } catch (err) {
        results[t] = { error: err.message };
      }
    }
    res.json({ ok: true, data: results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/weather ─ Forecast 7d ────────────
// ?lat=&lon=&refresh=true
router.get('/weather', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ ok: false, error: 'lat/lon requeridos' });
    }
    if (req.query.refresh === 'true') {
      await weatherMod.fetchForecast(lat, lon);
    }
    let rows = await weatherMod.getForecast(lat, lon);
    if (rows.length === 0) {
      // Lazy fetch
      await weatherMod.fetchForecast(lat, lon);
      rows = await weatherMod.getForecast(lat, lon);
    }
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/memberships ─ Lista subscriptions ─
router.get('/memberships', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, platform, annual_cost, currency, renews_at, last_paid_at,
        auto_renew, notes, is_active,
        CASE WHEN renews_at IS NULL THEN NULL ELSE (renews_at - CURRENT_DATE) END AS days_to_renewal
       FROM log_memberships ORDER BY renews_at ASC NULLS LAST`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/logistics/memberships/:id ──────────────────
router.put('/memberships/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, annual_cost, currency, renews_at, last_paid_at, auto_renew, notes, is_active } = req.body;
    const row = await db.queryOne(
      `UPDATE log_memberships SET
         platform = COALESCE($1, platform),
         annual_cost = COALESCE($2, annual_cost),
         currency = COALESCE($3, currency),
         renews_at = COALESCE($4, renews_at),
         last_paid_at = COALESCE($5, last_paid_at),
         auto_renew = COALESCE($6, auto_renew),
         notes = COALESCE($7, notes),
         is_active = COALESCE($8, is_active),
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [platform, annual_cost, currency, renews_at, last_paid_at, auto_renew, notes, is_active, id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Membership no encontrada' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics/doc-nz/refresh ─ Fetch DOC NZ ───
router.post('/doc-nz/refresh', async (req, res) => {
  try {
    const r = await docNz.refreshAll();
    res.json({ ok: true, data: r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/kiwi/status ─ Wise/Kiwi config ───
router.get('/kiwi/status', (req, res) => {
  res.json({ ok: true, configured: kiwi.isConfigured() });
});

module.exports = router;
