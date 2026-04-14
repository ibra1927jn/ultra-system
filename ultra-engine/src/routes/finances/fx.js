// FX rates: GET /fx (list or convert) · POST /fx/refresh (force fetch)
const express = require('express');
const fx = require('../../fx');

const router = express.Router();

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
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/fx/refresh', async (req, res) => {
  try { res.json({ ok: true, data: await fx.fetchLatest() }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
