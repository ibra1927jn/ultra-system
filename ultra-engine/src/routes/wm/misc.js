const express = require('express');
const fs = require('fs');
const path = require('path');
const { searchCache, filteredCache, briefCache, snapshotCache, suggestCache } = require('./cache');
const router = express.Router();

const dataDir = path.join(__dirname, '../../../data');
const cache = {};

// Cache stats — useful for tuning TTL/capacity and monitoring hit rates.
router.get('/cache-stats', (req, res) => {
  res.json({
    ok: true,
    caches: {
      search: searchCache.stats(),
      filtered: filteredCache.stats(),
      brief: briefCache.stats(),
      snapshot: snapshotCache.stats(),
      suggest: suggestCache.stats(),
    },
  });
});

router.get('/geo-hierarchy', (req, res) => {
  if (!cache['geo-hierarchy']) {
    try {
      cache['geo-hierarchy'] = JSON.parse(
        fs.readFileSync(path.join(dataDir, 'geo-hierarchy.json'), 'utf8')
      );
    } catch (err) {
      console.warn(`⚠️ geo-hierarchy load failed: ${err.message}`);
      return res.status(500).json({ ok: false, error: 'geo-hierarchy data unavailable' });
    }
  }
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(cache['geo-hierarchy']);
});

module.exports = router;
