// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Oportunidades (P5)                  ║
// ║  CRUD + pipeline + conversion rates + follow-up alerts   ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const { calculateConversionRates, OPPORTUNITY_DEADLINES_SQL } = require('../utils/conversion_rates');

const router = express.Router();

// ─── GET /api/opportunities ─ Listar oportunidades ──────
router.get('/', async (req, res) => {
  try {
    const { status, category, limit } = req.query;
    let sql = 'SELECT * FROM opportunities WHERE 1=1';
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC';
    params.push(parseInt(limit) || 50);
    sql += ` LIMIT $${params.length}`;

    const rows = await db.queryAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  PIPELINE — Funnel de oportunidades con tasas de conversion
// ═══════════════════════════════════════════════════════════

// ─── GET /api/opportunities/pipeline ─ Funnel + rates ───
router.get('/pipeline', async (req, res) => {
  try {
    // Conteo por status
    const counts = await db.queryAll(
      `SELECT status, COUNT(*) as count
       FROM opportunities
       GROUP BY status
       ORDER BY
         CASE status
           WHEN 'new' THEN 1
           WHEN 'contacted' THEN 2
           WHEN 'applied' THEN 3
           WHEN 'rejected' THEN 4
           WHEN 'won' THEN 5
         END`
    );

    const total = await db.queryOne('SELECT COUNT(*) as total FROM opportunities');
    const totalCount = parseInt(total.total) || 0;

    // Mapa de conteos para calcular tasas
    const statusMap = {};
    for (const row of counts) {
      statusMap[row.status] = parseInt(row.count);
    }

    const conversionRates = calculateConversionRates(statusMap, totalCount);

    // Oportunidades que necesitan follow-up (contacted > 7 dias sin cambio)
    const needFollowUp = await db.queryAll(
      `SELECT id, title, source, created_at,
         (CURRENT_DATE - created_at::date) as days_since_created
       FROM opportunities
       WHERE status = 'contacted'
         AND created_at < NOW() - INTERVAL '7 days'
       ORDER BY created_at ASC`
    );

    // Deadlines proximos (3 dias)
    const upcomingDeadlines = await db.queryAll(OPPORTUNITY_DEADLINES_SQL);

    res.json({
      ok: true,
      data: {
        total: totalCount,
        by_status: counts,
        conversion_rates: conversionRates,
        need_follow_up: needFollowUp,
        upcoming_deadlines: upcomingDeadlines,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/opportunities ─ Crear oportunidad ────────
router.post('/', async (req, res) => {
  try {
    const { title, source, url, category, status, notes, deadline } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Falta campo obligatorio: title' });
    }

    const validStatuses = ['new', 'contacted', 'applied', 'rejected', 'won'];
    const finalStatus = validStatuses.includes(status) ? status : 'new';

    const result = await db.queryOne(
      `INSERT INTO opportunities (title, source, url, category, status, notes, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, source || null, url || null, category || null, finalStatus, notes || null, deadline || null]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/opportunities/:id ─ Actualizar ──────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, source, url, category, status, notes, deadline } = req.body;

    const result = await db.queryOne(
      `UPDATE opportunities SET
       title = COALESCE($1, title),
       source = COALESCE($2, source),
       url = COALESCE($3, url),
       category = COALESCE($4, category),
       status = COALESCE($5, status),
       notes = COALESCE($6, notes),
       deadline = COALESCE($7, deadline)
       WHERE id = $8
       RETURNING *`,
      [title, source, url, category, status, notes, deadline, id]
    );

    if (!result) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada' });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
