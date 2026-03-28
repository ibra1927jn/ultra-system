// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Logistica (P6)                      ║
// ║  Gestion de transporte, alojamiento, visa, citas         ║
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

    // Filtro por tipo
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    // Filtro por status
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

// ─── POST /api/logistics ─ Crear item ───────────────────
router.post('/', async (req, res) => {
  try {
    const { type, title, date, location, notes, status } = req.body;

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
      `INSERT INTO logistics (type, title, date, location, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [type, title, date, location || null, notes || null, finalStatus]
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
    const { type, title, date, location, notes, status } = req.body;

    const result = await db.queryOne(
      `UPDATE logistics SET
       type = COALESCE($1, type),
       title = COALESCE($2, title),
       date = COALESCE($3, date),
       location = COALESCE($4, location),
       notes = COALESCE($5, notes),
       status = COALESCE($6, status)
       WHERE id = $7
       RETURNING *`,
      [type, title, date, location, notes, status, id]
    );

    if (!result) return res.status(404).json({ ok: false, error: 'Item no encontrado' });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
