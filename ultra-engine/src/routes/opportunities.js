// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Oportunidades (P5)                  ║
// ║  CRUD de oportunidades freelance, ideas, negocios        ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── GET /api/opportunities ─ Listar oportunidades ──────
router.get('/', async (req, res) => {
  try {
    const { status, category, limit } = req.query;
    let sql = 'SELECT * FROM opportunities WHERE 1=1';
    const params = [];

    // Filtro por status
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    // Filtro por categoria
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
