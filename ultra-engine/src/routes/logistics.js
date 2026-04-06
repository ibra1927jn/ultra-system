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
    // Queries independientes — ejecutar en paralelo
    const [byType, byLocation, totals] = await Promise.all([
      db.queryAll(
        `SELECT type,
           COUNT(*) as count,
           COALESCE(SUM(cost), 0) as total_cost,
           ROUND(COALESCE(AVG(cost), 0)::numeric, 2) as avg_cost
         FROM logistics
         WHERE cost > 0
         GROUP BY type
         ORDER BY total_cost DESC`
      ),
      db.queryAll(
        `SELECT
           COALESCE(location, 'Sin ubicacion') as location,
           COUNT(*) as count,
           COALESCE(SUM(cost), 0) as total_cost
         FROM logistics
         WHERE cost > 0
         GROUP BY location
         ORDER BY total_cost DESC`
      ),
      db.queryOne(
        `SELECT
           COUNT(*) as total_items,
           COALESCE(SUM(cost), 0) as total_cost,
           ROUND(COALESCE(AVG(cost), 0)::numeric, 2) as avg_cost
         FROM logistics
         WHERE cost > 0`
      ),
    ]);

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

module.exports = router;
