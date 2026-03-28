// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Finanzas (P3)                       ║
// ║  CRUD de ingresos/gastos + resumen mensual               ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── GET /api/finances ─ Listar movimientos ──────────────
router.get('/', async (req, res) => {
  try {
    const { type, category, limit } = req.query;
    let sql = 'SELECT * FROM finances WHERE 1=1';
    const params = [];

    // Filtro por tipo (income/expense)
    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    // Filtro por categoria
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    sql += ' ORDER BY date DESC';
    params.push(parseInt(limit) || 50);
    sql += ` LIMIT $${params.length}`;

    const rows = await db.queryAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/summary ─ Resumen mensual ────────
router.get('/summary', async (req, res) => {
  try {
    // Mes actual por defecto, o parametro ?month=2026-03
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const summary = await db.queryAll(
      `SELECT type,
       COUNT(*) as count,
       SUM(amount) as total,
       ARRAY_AGG(DISTINCT category) as categories
       FROM finances
       WHERE TO_CHAR(date, 'YYYY-MM') = $1
       GROUP BY type`,
      [month]
    );

    // Desglose por categoria
    const byCategory = await db.queryAll(
      `SELECT category, type, SUM(amount) as total, COUNT(*) as count
       FROM finances
       WHERE TO_CHAR(date, 'YYYY-MM') = $1
       GROUP BY category, type
       ORDER BY total DESC`,
      [month]
    );

    const income = summary.find(r => r.type === 'income')?.total || 0;
    const expense = summary.find(r => r.type === 'expense')?.total || 0;

    res.json({
      ok: true,
      data: {
        month,
        income: parseFloat(income),
        expense: parseFloat(expense),
        balance: parseFloat(income) - parseFloat(expense),
        byCategory,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances ─ Registrar movimiento ──────────
router.post('/', async (req, res) => {
  try {
    const { type, amount, category, description, date } = req.body;

    if (!type || !amount || !category) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: type, amount, category' });
    }

    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'type debe ser income o expense' });
    }

    if (parseFloat(amount) <= 0 || isNaN(parseFloat(amount))) {
      return res.status(400).json({ ok: false, error: 'amount debe ser un numero positivo' });
    }

    const result = await db.queryOne(
      `INSERT INTO finances (type, amount, category, description, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [type, parseFloat(amount), category, description || null, date || new Date().toISOString().split('T')[0]]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
