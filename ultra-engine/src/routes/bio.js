// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Bio-Check (P7)                      ║
// ║  Seguimiento de sueno, energia, animo, ejercicio         ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── GET /api/bio ─ Listar registros ────────────────────
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 30;
    const rows = await db.queryAll(
      'SELECT * FROM bio_checks ORDER BY date DESC LIMIT $1',
      [limit]
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/bio/trends ─ Promedios semanales ──────────
router.get('/trends', async (req, res) => {
  try {
    // Ultimas 4 semanas por defecto
    const weeks = parseInt(req.query.weeks) || 4;

    const trends = await db.queryAll(
      `SELECT
         DATE_TRUNC('week', date) AS week_start,
         COUNT(*) AS entries,
         ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep,
         ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
         ROUND(AVG(mood)::numeric, 1) AS avg_mood,
         ROUND(AVG(exercise_minutes)::numeric, 0) AS avg_exercise
       FROM bio_checks
       WHERE date >= CURRENT_DATE - ($1 * 7)::integer
       GROUP BY DATE_TRUNC('week', date)
       ORDER BY week_start DESC`,
      [weeks]
    );

    // Resumen global del periodo
    const overall = await db.queryOne(
      `SELECT
         COUNT(*) AS total_entries,
         ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep,
         ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
         ROUND(AVG(mood)::numeric, 1) AS avg_mood,
         ROUND(AVG(exercise_minutes)::numeric, 0) AS avg_exercise
       FROM bio_checks
       WHERE date >= CURRENT_DATE - ($1 * 7)::integer`,
      [weeks]
    );

    res.json({ ok: true, data: { weeks: trends, overall } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bio ─ Registrar check diario ─────────────
router.post('/', async (req, res) => {
  try {
    const { date, sleep_hours, energy_level, mood, exercise_minutes, notes } = req.body;

    // Validaciones basicas
    if (sleep_hours == null || energy_level == null || mood == null) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: sleep_hours, energy_level, mood' });
    }

    if (energy_level < 1 || energy_level > 10 || mood < 1 || mood > 10) {
      return res.status(400).json({ ok: false, error: 'energy_level y mood deben estar entre 1 y 10' });
    }

    const parsedSleep = parseFloat(sleep_hours);
    if (isNaN(parsedSleep) || parsedSleep < 0 || parsedSleep > 24) {
      return res.status(400).json({ ok: false, error: 'sleep_hours debe estar entre 0 y 24' });
    }

    const result = await db.queryOne(
      `INSERT INTO bio_checks (date, sleep_hours, energy_level, mood, exercise_minutes, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        date || new Date().toISOString().split('T')[0],
        parseFloat(sleep_hours),
        parseInt(energy_level),
        parseInt(mood),
        parseInt(exercise_minutes) || 0,
        notes || null,
      ]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
