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
const akahu = require('../akahu');
const taxReporting = require('../tax_reporting');
const investments = require('../investments');
const recurring = require('../recurring');
const crypto = require('../crypto');
const bridges = require('../bridges');

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

// ═══════════════════════════════════════════════════════════
//  P3 FASE 2 — RECURRING DETECTION
// ═══════════════════════════════════════════════════════════

// ─── POST /api/finances/recurring/detect ─────────────────
router.post('/recurring/detect', async (req, res) => {
  try {
    const lookbackDays = parseInt(req.body?.lookback_days || '365', 10);
    const minSamples = parseInt(req.body?.min_samples || '3', 10);
    const result = await recurring.detectRecurring({ lookbackDays, minSamples });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/recurring ─────────────────────────
router.get('/recurring', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, payee_normalized, frequency, amount_avg, currency,
              next_expected, last_seen, confidence, sample_size, avg_interval_days,
              confirmed,
              (next_expected - CURRENT_DATE) AS days_until
       FROM fin_recurring
       WHERE confidence >= 0.5
       ORDER BY confidence DESC, amount_avg DESC`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/finances/recurring/:id/confirm ───────────
router.patch('/recurring/:id/confirm', async (req, res) => {
  try {
    const row = await db.queryOne(
      `UPDATE fin_recurring SET confirmed=$1 WHERE id=$2 RETURNING *`,
      [req.body?.confirmed !== false, req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P3 FASE 2 — SAVINGS GOALS
// ═══════════════════════════════════════════════════════════

router.get('/savings-goals', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, name, target_amount, current_amount, currency, target_date,
              category, is_active, notes,
              CASE WHEN target_amount > 0
                   THEN ROUND((current_amount / target_amount * 100)::numeric, 1)
                   ELSE 0 END AS progress_pct,
              CASE WHEN target_date IS NULL THEN NULL
                   ELSE (target_date - CURRENT_DATE) END AS days_remaining
       FROM fin_savings_goals
       WHERE is_active = TRUE
       ORDER BY target_date ASC NULLS LAST`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/savings-goals', async (req, res) => {
  try {
    const { name, target_amount, current_amount, currency, target_date, category, notes } = req.body;
    if (!name || !target_amount) {
      return res.status(400).json({ ok: false, error: 'name y target_amount obligatorios' });
    }
    const row = await db.queryOne(
      `INSERT INTO fin_savings_goals
       (name, target_amount, current_amount, currency, target_date, category, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name, target_amount, current_amount || 0, currency || 'NZD', target_date || null, category || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/savings-goals/:id', async (req, res) => {
  try {
    const { current_amount, target_amount, target_date, is_active, notes } = req.body;
    const row = await db.queryOne(
      `UPDATE fin_savings_goals SET
         current_amount = COALESCE($1, current_amount),
         target_amount  = COALESCE($2, target_amount),
         target_date    = COALESCE($3, target_date),
         is_active      = COALESCE($4, is_active),
         notes          = COALESCE($5, notes),
         updated_at     = NOW()
       WHERE id=$6 RETURNING *`,
      [current_amount, target_amount, target_date, is_active, notes, req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/savings-goals/:id', async (req, res) => {
  try {
    const row = await db.queryOne(
      'DELETE FROM fin_savings_goals WHERE id=$1 RETURNING id',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, deleted: row.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P3 FASE 2 — NET WORTH TIMELINE
// ═══════════════════════════════════════════════════════════

// ─── GET /api/finances/nw-timeline?days=90 ───────────────
router.get('/nw-timeline', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '90', 10);
    const rows = await db.queryAll(
      `SELECT date, total_nzd, breakdown
       FROM fin_net_worth_snapshots
       WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY date ASC`
    );

    let trend = null;
    if (rows.length >= 2) {
      const first = parseFloat(rows[0].total_nzd);
      const last = parseFloat(rows[rows.length - 1].total_nzd);
      const delta = last - first;
      const pct = first !== 0 ? (delta / first * 100) : 0;
      const periodDays = (new Date(rows[rows.length - 1].date) - new Date(rows[0].date)) / 86400000;
      const dailyChange = periodDays > 0 ? delta / periodDays : 0;
      trend = {
        first_date: rows[0].date,
        last_date: rows[rows.length - 1].date,
        first_nzd: first,
        last_nzd: last,
        delta_nzd: Number(delta.toFixed(2)),
        delta_pct: Number(pct.toFixed(2)),
        avg_daily_change_nzd: Number(dailyChange.toFixed(2)),
        period_days: Math.round(periodDays),
      };
    }

    res.json({ ok: true, count: rows.length, trend, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P3 FASE 2 — CRYPTO HOLDINGS
// ═══════════════════════════════════════════════════════════

// ─── GET /api/finances/crypto ────────────────────────────
router.get('/crypto', async (req, res) => {
  try {
    const result = await crypto.getHoldings();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances/crypto ───────────────────────────
router.post('/crypto', async (req, res) => {
  try {
    const { symbol, amount, exchange, wallet_address, notes } = req.body;
    if (!symbol || amount === undefined || !exchange) {
      return res.status(400).json({ ok: false, error: 'symbol, amount, exchange obligatorios' });
    }
    const row = await db.queryOne(
      `INSERT INTO fin_crypto_holdings (symbol, amount, exchange, wallet_address, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (symbol, exchange) DO UPDATE SET
         amount=EXCLUDED.amount, wallet_address=EXCLUDED.wallet_address,
         notes=EXCLUDED.notes, updated_at=NOW()
       RETURNING *`,
      [symbol.toUpperCase(), amount, exchange, wallet_address || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/finances/crypto/:id ─────────────────────
router.delete('/crypto/:id', async (req, res) => {
  try {
    const row = await db.queryOne(
      'DELETE FROM fin_crypto_holdings WHERE id=$1 RETURNING id',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, deleted: row.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances/crypto/sync-binance ──────────────
router.post('/crypto/sync-binance', async (req, res) => {
  try {
    const result = await crypto.syncBinance();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P3 FASE 3b — INVESTMENTS (Stooq prices)
// ═══════════════════════════════════════════════════════════

router.get('/investments', async (req, res) => {
  try {
    const portfolio = await investments.getPortfolio();
    res.json({ ok: true, ...portfolio });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/investments', async (req, res) => {
  try {
    const { symbol, quantity, avg_cost, currency, account, opened_at, notes } = req.body;
    if (!symbol || !quantity) return res.status(400).json({ ok: false, error: 'symbol y quantity obligatorios' });
    const row = await db.queryOne(
      `INSERT INTO fin_investments (symbol, quantity, avg_cost, currency, account, opened_at, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [symbol.toUpperCase(), quantity, avg_cost || null, currency || 'USD', account || null, opened_at || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/investments/quote/:symbol', async (req, res) => {
  try {
    const q = await investments.getQuote(req.params.symbol);
    res.json({ ok: true, data: q });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/tax/modelo-100?year= ─────
router.get('/tax/modelo-100', async (req, res) => {
  try {
    const result = await taxReporting.generateModelo100({ year: parseInt(req.query.year, 10) || undefined });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/tax/residency-es ─────────
router.get('/tax/residency-es', async (req, res) => {
  try {
    const result = await taxReporting.computeResidencyES({ year: parseInt(req.query.year, 10) || undefined });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/tax/modelo-720?year=2025 ───
router.get('/tax/modelo-720', async (req, res) => {
  try {
    const result = await taxReporting.generateModelo720({ year: parseInt(req.query.year, 10) || undefined });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/tax/modelo-721?year=2025 ───
router.get('/tax/modelo-721', async (req, res) => {
  try {
    const result = await taxReporting.generateModelo721({ year: parseInt(req.query.year, 10) || undefined });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/providers ─ Status de integraciones ─
router.get('/providers', async (req, res) => {
  try {
    const providers = [
      {
        id: 'wise',
        name: 'Wise (TransferWise)',
        configured: wise.isConfigured(),
        env_required: ['WISE_API_TOKEN'],
        docs: 'https://docs.wise.com/api-docs',
        scope: 'multi-currency balances + transactions read-only',
      },
      {
        id: 'akahu',
        name: 'Akahu (NZ Open Banking)',
        configured: akahu.isConfigured(),
        env_required: ['AKAHU_USER_TOKEN', 'AKAHU_APP_TOKEN'],
        docs: 'https://developers.akahu.nz/docs',
        scope: 'NZ banks (ANZ/ASB/BNZ/Kiwibank/Westpac) read-only',
      },
      {
        id: 'binance_ccxt',
        name: 'Binance via ccxt',
        configured: !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET),
        env_required: ['BINANCE_API_KEY', 'BINANCE_API_SECRET'],
        docs: 'https://docs.ccxt.com',
        scope: 'spot balances read-only (use API key sin withdraw permission)',
      },
      {
        id: 'coingecko',
        name: 'CoinGecko prices',
        configured: true,
        env_required: [],
        docs: 'https://www.coingecko.com/en/api',
        scope: 'crypto prices vs NZD (free public)',
      },
      {
        id: 'frankfurter_fx',
        name: 'Frankfurter FX',
        configured: true,
        env_required: [],
        docs: 'https://www.frankfurter.app',
        scope: 'ECB FX rates (free public)',
      },
    ];
    res.json({ ok: true, providers });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/finances/akahu/sync ───────────────────────
router.post('/akahu/sync', async (req, res) => {
  try {
    const result = await akahu.importRecent({ daysBack: req.body?.days_back || 7 });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/runway-status (con bridges) ───────
router.get('/runway-status', async (req, res) => {
  try {
    const status = await bridges.getCurrentRunway();
    if (!status) {
      return res.json({ ok: true, status: null, message: 'Sin snapshots NW o burn rate=0' });
    }
    res.json({ ok: true, status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/finances/crypto/prices?symbols=BTC,ETH ─────
router.get('/crypto/prices', async (req, res) => {
  try {
    const symbols = (req.query.symbols || 'BTC,ETH,SOL').split(',');
    const vs = (req.query.vs || 'NZD').toUpperCase();
    const prices = await crypto.fetchPrices(symbols, vs);
    res.json({ ok: true, vs, prices });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
