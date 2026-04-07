// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Finanzas (P3)                       ║
// ║  CRUD ingresos/gastos + budget + runway + alertas        ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const multer = require('multer');
const db = require('../db');
const fx = require('../fx');
const bankCsv = require('../bank_csv');
const wise = require('../wise');

const router = express.Router();
const upload = multer({
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max para CSV bancarios
  storage: multer.memoryStorage(),
});

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

// ═══════════════════════════════════════════════════════════
//  BUDGET & RUNWAY — Presupuesto inteligente
// ═══════════════════════════════════════════════════════════

// ─── GET /api/finances/budget ─ Budget mensual + runway ──
router.get('/budget', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    // Ingresos y gastos del mes
    const income = await db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM finances
       WHERE type = 'income' AND TO_CHAR(date, 'YYYY-MM') = $1`,
      [month]
    );
    const expenses = await db.queryOne(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM finances
       WHERE type = 'expense' AND TO_CHAR(date, 'YYYY-MM') = $1`,
      [month]
    );

    // Gastos por categoria con limites de budget
    const byCategory = await db.queryAll(
      `SELECT
         f.category,
         COALESCE(SUM(f.amount), 0) as spent,
         b.monthly_limit,
         CASE WHEN b.monthly_limit > 0
           THEN ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1)
           ELSE NULL
         END as percent_used
       FROM finances f
       LEFT JOIN budgets b ON LOWER(b.category) = LOWER(f.category)
       WHERE f.type = 'expense' AND TO_CHAR(f.date, 'YYYY-MM') = $1
       GROUP BY f.category, b.monthly_limit
       ORDER BY spent DESC`,
      [month]
    );

    const totalIncome = parseFloat(income.total);
    const totalExpense = parseFloat(expenses.total);
    const remaining = totalIncome - totalExpense;

    // Calcular burn rate diario (dias transcurridos del mes)
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    const dailyBurn = dayOfMonth > 0 ? totalExpense / dayOfMonth : 0;

    // Runway: dias hasta $0 basado en balance actual y burn rate
    const runway = dailyBurn > 0 ? Math.floor(remaining / dailyBurn) : remaining > 0 ? 999 : 0;

    res.json({
      ok: true,
      data: {
        month,
        income: totalIncome,
        expenses: totalExpense,
        remaining,
        daily_burn: Math.round(dailyBurn * 100) / 100,
        runway_days: runway,
        days_elapsed: dayOfMonth,
        days_in_month: daysInMonth,
        by_category: byCategory,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances/budget ─ Set limite por categoria ─
router.post('/budget', async (req, res) => {
  try {
    const { category, monthly_limit } = req.body;

    if (!category || monthly_limit == null) {
      return res.status(400).json({ ok: false, error: 'Faltan campos: category, monthly_limit' });
    }

    if (parseFloat(monthly_limit) <= 0) {
      return res.status(400).json({ ok: false, error: 'monthly_limit debe ser positivo' });
    }

    const result = await db.queryOne(
      `INSERT INTO budgets (category, monthly_limit)
       VALUES ($1, $2)
       ON CONFLICT (category) DO UPDATE SET monthly_limit = $2
       RETURNING *`,
      [category.toLowerCase().trim(), parseFloat(monthly_limit)]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/alerts ─ Categorias excediendo 80% ─
router.get('/alerts', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);

    const alerts = await db.queryAll(
      `SELECT
         b.category,
         b.monthly_limit,
         COALESCE(SUM(f.amount), 0) as spent,
         ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1) as percent_used
       FROM budgets b
       LEFT JOIN finances f ON LOWER(f.category) = LOWER(b.category)
         AND f.type = 'expense'
         AND TO_CHAR(f.date, 'YYYY-MM') = $1
       GROUP BY b.category, b.monthly_limit
       HAVING COALESCE(SUM(f.amount), 0) >= b.monthly_limit * 0.8
       ORDER BY percent_used DESC`,
      [month]
    );

    res.json({
      ok: true,
      data: alerts,
      count: alerts.length,
      threshold: '80%',
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

// ═══════════════════════════════════════════════════════════
//  P3 Phase 1 Quick Win — CSV import, FX, runway extendido
// ═══════════════════════════════════════════════════════════

// ─── POST /api/finances/import-csv ─ Sube CSV bancario ───
// multipart/form-data: file=<csv>, bank=<asb|anz|westpac|bnz|kiwibank|auto>
router.post('/import-csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se envió archivo' });

    const csvText = req.file.buffer.toString('utf8');
    const requestedBank = (req.body.bank || 'auto').toLowerCase();
    const profileId = requestedBank === 'auto' ? null : requestedBank;

    const result = bankCsv.parseCsv(csvText, profileId);
    if (result.error || !result.rows) {
      return res.status(400).json({ ok: false, error: result.error || 'Parse falló' });
    }

    let inserted = 0, skipped = 0, failed = 0;
    for (const row of result.rows) {
      try {
        // Convierte amount a NZD via FX cache (si la cuenta es NZD, amount_nzd = amount)
        const amountNzd = await fx.convert(row.amount, 'NZD', 'NZD');
        const r = await db.queryOne(
          `INSERT INTO finances
             (type, amount, currency, amount_nzd, category, description, date,
              account, source, fingerprint)
           VALUES ($1, $2, 'NZD', $3, 'csv_import', $4, $5, $6, 'csv', $7)
           ON CONFLICT (fingerprint) WHERE fingerprint IS NOT NULL DO NOTHING
           RETURNING id`,
          [row.type, row.amount, amountNzd, row.description, row.date, row.account, row.fingerprint]
        );
        if (r) inserted++;
        else skipped++;
      } catch (err) {
        failed++;
        console.warn('CSV row failed:', err.message);
      }
    }

    res.json({
      ok: true,
      bank: result.profile,
      bank_name: result.name,
      total_rows: result.rows.length,
      inserted,
      skipped_duplicates: skipped,
      failed,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/import-csv/profiles ─ Lista perfiles ─
router.get('/import-csv/profiles', (req, res) => {
  res.json({ ok: true, data: bankCsv.PROFILES });
});

// ─── GET /api/finances/fx ─ Tipos de cambio ──────────────
// /api/finances/fx                       → todos los rates cacheados
// /api/finances/fx?from=NZD&to=EUR&amount=100 → conversión específica
router.get('/fx', async (req, res) => {
  try {
    const { from, to, amount } = req.query;
    if (from && to) {
      const converted = await fx.convert(parseFloat(amount || 1), from, to);
      if (converted === null) {
        return res.status(404).json({
          ok: false,
          error: `Rate ${from}→${to} no cacheado. Llama POST /api/finances/fx/refresh primero.`,
        });
      }
      return res.json({
        ok: true,
        data: { from: from.toUpperCase(), to: to.toUpperCase(), amount: parseFloat(amount || 1), converted },
      });
    }
    const rates = await fx.listLatestRates();
    res.json({ ok: true, base: fx.BASE, data: rates });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances/fx/refresh ─ Forzar refresh ──────
router.post('/fx/refresh', async (req, res) => {
  try {
    const r = await fx.fetchLatest();
    res.json({ ok: true, data: r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/runway ─ Runway extendido + NW ────
router.get('/runway', async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const income = parseFloat((await db.queryOne(
      `SELECT COALESCE(SUM(amount_nzd), SUM(amount)) AS total FROM finances
       WHERE type='income' AND TO_CHAR(date,'YYYY-MM')=$1`, [month]
    )).total || 0);
    const expense = parseFloat((await db.queryOne(
      `SELECT COALESCE(SUM(amount_nzd), SUM(amount)) AS total FROM finances
       WHERE type='expense' AND TO_CHAR(date,'YYYY-MM')=$1`, [month]
    )).total || 0);

    // Burn rate de los últimos 90 días (más estable que solo el mes actual)
    const burn90 = parseFloat((await db.queryOne(
      `SELECT COALESCE(SUM(amount_nzd), SUM(amount))/90.0 AS daily FROM finances
       WHERE type='expense' AND date >= CURRENT_DATE - 90`
    )).daily || 0);

    const remaining = income - expense;
    const dayOfMonth = new Date().getDate();
    const burnMonth = dayOfMonth > 0 ? expense / dayOfMonth : 0;
    const runwayMonth = burnMonth > 0 ? Math.floor(remaining / burnMonth) : 999;
    const runway90 = burn90 > 0 ? Math.floor(remaining / burn90) : 999;

    // Net worth snapshot del día (si existe)
    const nw = await db.queryOne(
      `SELECT date, total_nzd, breakdown FROM fin_net_worth_snapshots
       ORDER BY date DESC LIMIT 1`
    );

    // Breakdown por cuenta (multi-currency aware)
    const byAccount = await db.queryAll(
      `SELECT
         COALESCE(account, 'manual') AS account,
         COALESCE(currency, 'NZD') AS currency,
         SUM(CASE WHEN type='income' THEN amount_nzd ELSE 0 END) AS in_nzd,
         SUM(CASE WHEN type='expense' THEN amount_nzd ELSE 0 END) AS out_nzd,
         COUNT(*) AS txns
       FROM finances
       WHERE TO_CHAR(date,'YYYY-MM') = $1
       GROUP BY account, currency
       ORDER BY (in_nzd - out_nzd) DESC`,
      [month]
    );

    res.json({
      ok: true,
      data: {
        month,
        income_nzd: income,
        expense_nzd: expense,
        remaining_nzd: remaining,
        burn_rate_month: Math.round(burnMonth * 100) / 100,
        burn_rate_90d: Math.round(burn90 * 100) / 100,
        runway_days_month: runwayMonth,
        runway_days_90d: runway90,
        net_worth_snapshot: nw,
        by_account: byAccount,
        wise_configured: wise.isConfigured(),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
