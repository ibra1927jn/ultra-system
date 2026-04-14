// Tax cockpit endpoints — ES (Modelo 100/720/721/Beckham/Residency) + NZ (PAYE/FIF)
const express = require('express');
const taxReporting = require('../../tax_reporting');
const investments = require('../../investments');

const router = express.Router();

router.get('/tax/modelo-100', async (req, res) => {
  try { res.json({ ok: true, data: await taxReporting.generateModelo100({ year: parseInt(req.query.year, 10) || undefined }) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/tax/paye-nz', async (req, res) => {
  try {
    const gross = parseFloat(req.query.gross || '0');
    res.json({ ok: true, data: taxReporting.computePayeNZ({ annual_income_nzd: gross }) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/tax/residency-es', async (req, res) => {
  try { res.json({ ok: true, data: await taxReporting.computeResidencyES({ year: parseInt(req.query.year, 10) || undefined }) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/tax/modelo-720', async (req, res) => {
  try { res.json({ ok: true, data: await taxReporting.generateModelo720({ year: parseInt(req.query.year, 10) || undefined }) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/tax/modelo-721', async (req, res) => {
  try { res.json({ ok: true, data: await taxReporting.generateModelo721({ year: parseInt(req.query.year, 10) || undefined }) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// FIF default: derives positions from current offshore investments. POST allows custom hypothetical.
router.get('/tax/fif-nz', async (req, res) => {
  try {
    const marginalRate = parseFloat(req.query.marginal_rate) || 0.33;
    const portfolio = await investments.getPortfolio();
    const offshore = portfolio.positions.filter(p => p.currency && p.currency !== 'NZD');
    const positions = offshore.map(p => ({
      symbol: p.symbol, market_value_nzd: p.value_nzd, cost_nzd: p.cost_nzd, dividends_nzd: 0,
    }));
    const result = taxReporting.computeFIF_NZ({ positions, marginalRate });
    res.json({ ok: true, source: 'fin_investments_offshore', positions_used: positions.length, data: result });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/tax/fif-nz', async (req, res) => {
  try {
    const { positions, marginal_rate } = req.body || {};
    res.json({
      ok: true, source: 'request_body',
      data: taxReporting.computeFIF_NZ({ positions: positions || [], marginalRate: parseFloat(marginal_rate) || 0.33 }),
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.get('/tax/beckham', async (req, res) => {
  try {
    const gross = parseFloat(req.query.gross || '0');
    res.json({ ok: true, data: taxReporting.computeBeckham({ gross_income_eur: gross }) });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
