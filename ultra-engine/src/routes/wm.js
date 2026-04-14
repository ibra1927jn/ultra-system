// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: WorldMonitor (thin aggregator)      ║
// ║                                                          ║
// ║  Actual routes live in ./wm/ submodules:                 ║
// ║    constants.js — COUNTRY_ALIASES, TOPIC_KEYWORDS, regex ║
// ║    news.js      — summary, news/*, filtered, pulse       ║
// ║    map.js       — map/* (dynamic + static layers)        ║
// ║    markets.js   — markets/snapshot, intelligence-brief,  ║
// ║                   markets/sparklines                     ║
// ║    article.js   — article/:id, fulltext, translate       ║
// ║    search.js    — search, search/suggest                 ║
// ║    compare.js   — compare (side-by-side countries)       ║
// ║    misc.js      — geo-hierarchy                          ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();

router.use(require('./wm/news'));
router.use(require('./wm/map'));
router.use(require('./wm/markets'));
router.use(require('./wm/article'));
router.use(require('./wm/search'));
router.use(require('./wm/compare'));
router.use(require('./wm/misc'));

module.exports = router;
