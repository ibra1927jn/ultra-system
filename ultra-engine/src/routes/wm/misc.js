const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const dataDir = path.join(__dirname, '../../../data');
const cache = {};

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
