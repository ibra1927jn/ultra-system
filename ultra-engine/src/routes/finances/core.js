// GET / · POST / · GET /summary — ledger CRUD + monthly aggregate.
// Bridge: when Firefly III is configured, GET reads it; POST writes both
// (local first to preserve budgets/recurring, then forward to FF3).
const express = require('express');
const db = require('../../db');
const firefly = require('../../firefly');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { type, category, limit } = req.query;
    const lim = parseInt(limit) || 50;

    if (firefly.isConfigured()) {
      const ffType = type === 'expense' ? 'withdrawal' : type === 'income' ? 'deposit' : null;
      const ff = await firefly.listTransactions({ type: ffType, limit: lim });
      if (ff.ok) {
        const rows = (ff.data?.data || []).map(t => {
          const tx = t.attributes?.transactions?.[0] || {};
          return {
            id: t.id,
            type: tx.type === 'withdrawal' ? 'expense' : tx.type === 'deposit' ? 'income' : tx.type,
            amount: parseFloat(tx.amount), currency: tx.currency_code, category: tx.category_name,
            description: tx.description, date: tx.date?.slice(0, 10),
            account: tx.source_name || tx.destination_name, external_id: tx.external_id, source: 'firefly',
          };
        });
        const filtered = category ? rows.filter(r => r.category === category) : rows;
        res.set('x-source', 'firefly');
        return res.json({ ok: true, data: filtered, source: 'firefly' });
      }
    }

    let sql = 'SELECT * FROM finances WHERE 1=1';
    const params = [];
    if (type) { params.push(type); sql += ` AND type = $${params.length}`; }
    if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
    sql += ' ORDER BY date DESC';
    params.push(lim);
    sql += ` LIMIT $${params.length}`;
    const rows = await db.queryAll(sql, params);
    res.set('x-source', 'local');
    res.json({ ok: true, data: rows, source: 'local' });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/summary', async (req, res) => {
  try {
    const data = await require('../../domain/finances').getMonthSummary(req.query.month);
    res.json({ ok: true, data });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { type, amount, category, description, date, currency, account } = req.body;

    if (!type || !amount || !category) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: type, amount, category' });
    }
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ ok: false, error: 'type debe ser income o expense' });
    }
    if (parseFloat(amount) <= 0 || isNaN(parseFloat(amount))) {
      return res.status(400).json({ ok: false, error: 'amount debe ser un numero positivo' });
    }

    const txDate = date || new Date().toISOString().split('T')[0];
    const cur = currency || 'NZD';
    const acct = account || 'Cash';

    const local = await db.queryOne(
      `INSERT INTO finances (type, amount, category, description, date, currency, account)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [type, parseFloat(amount), category, description || null, txDate, cur, acct]
    );

    let ffResult = null;
    if (firefly.isConfigured()) {
      const isExpense = type === 'expense';
      const tx = await firefly.createTransaction({
        type: isExpense ? 'withdrawal' : 'deposit',
        amount: parseFloat(amount), currency_code: cur,
        description: description || `${type} ${category}`,
        date: txDate, category_name: category,
        source_name: isExpense ? acct : (category || 'Income'),
        destination_name: isExpense ? category : acct,
        external_id: `ultra:${local.id}`,
      });
      ffResult = tx.ok ? { ok: true, firefly_id: tx.data?.data?.id } : { ok: false, error: tx.error };
      if (!tx.ok) console.warn('⚠️ Firefly forward failed:', tx.error);
    }

    // Invalida cache del home aggregator para reflejar nuevo gasto/ingreso.
    require('../../domain/home-cache').invalidate('money.');
    res.status(201).json({ ok: true, data: local, firefly: ffResult });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
