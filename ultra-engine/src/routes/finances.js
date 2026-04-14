// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Finanzas (P3 thin aggregator)       ║
// ║                                                          ║
// ║  Actual routes live in ./finances/ submodules:           ║
// ║    core.js        — GET / · POST / · GET /summary        ║
// ║    budget.js      — /budget · /budget/carryover · /alerts║
// ║    csv.js         — /import-csv · /import-csv/profiles   ║
// ║    fx.js          — /fx · /fx/refresh                    ║
// ║    runway.js      — /runway · /runway-status             ║
// ║    recurring.js   — /recurring · /recurring/detect       ║
// ║    goals.js       — /savings-goals CRUD                  ║
// ║    nw.js          — /nw-timeline                         ║
// ║    crypto.js      — /crypto · /crypto/sync · /prices     ║
// ║    investments.js — /investments · /quote · /perf · /twr ║
// ║    tax.js         — /tax/* (ES + NZ)                     ║
// ║    receipt.js     — /receipt (Tesseract OCR)             ║
// ║    providers.js   — /providers · /akahu/sync             ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const router = express.Router();

router.use(require('./finances/core'));
router.use(require('./finances/budget'));
router.use(require('./finances/csv'));
router.use(require('./finances/fx'));
router.use(require('./finances/runway'));
router.use(require('./finances/recurring'));
router.use(require('./finances/goals'));
router.use(require('./finances/nw'));
router.use(require('./finances/crypto'));
router.use(require('./finances/investments'));
router.use(require('./finances/tax'));
router.use(require('./finances/receipt'));
router.use(require('./finances/providers'));

module.exports = router;
