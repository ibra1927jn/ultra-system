// GET /providers — integration status table · POST /akahu/sync — pull NZ bank data
const express = require('express');
const wise = require('../../wise');
const akahu = require('../../akahu');

const router = express.Router();

router.get('/providers', async (req, res) => {
  try {
    res.json({
      ok: true,
      providers: [
        {
          id: 'wise', name: 'Wise (TransferWise)',
          configured: wise.isConfigured(),
          env_required: ['WISE_API_TOKEN'],
          docs: 'https://docs.wise.com/api-docs',
          scope: 'multi-currency balances + transactions read-only',
        },
        {
          id: 'akahu', name: 'Akahu (NZ Open Banking)',
          configured: akahu.isConfigured(),
          env_required: ['AKAHU_USER_TOKEN', 'AKAHU_APP_TOKEN'],
          docs: 'https://developers.akahu.nz/docs',
          scope: 'NZ banks (ANZ/ASB/BNZ/Kiwibank/Westpac) read-only',
        },
        {
          id: 'binance_ccxt', name: 'Binance via ccxt',
          configured: !!(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET),
          env_required: ['BINANCE_API_KEY', 'BINANCE_API_SECRET'],
          docs: 'https://docs.ccxt.com',
          scope: 'spot balances read-only (use API key sin withdraw permission)',
        },
        {
          id: 'coingecko', name: 'CoinGecko prices',
          configured: true, env_required: [],
          docs: 'https://www.coingecko.com/en/api',
          scope: 'crypto prices vs NZD (free public)',
        },
        {
          id: 'frankfurter_fx', name: 'Frankfurter FX',
          configured: true, env_required: [],
          docs: 'https://www.frankfurter.app',
          scope: 'ECB FX rates (free public)',
        },
      ],
    });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

router.post('/akahu/sync', async (req, res) => {
  try { res.json({ ok: true, ...(await akahu.importRecent({ daysBack: req.body?.days_back || 7 })) }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
