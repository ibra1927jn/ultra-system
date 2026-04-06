// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Bio-Check (P7)                      ║
// ║  Seguimiento salud + correlaciones + alertas             ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const { pearson } = require('../utils/pearson');
const { generateBioAlerts } = require('../utils/bio_alerts');
const { generateCorrelationInsights } = require('../utils/bio_insights');
const { toDateStr } = require('../utils/date_format');

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
    const weeks = parseInt(req.query.weeks) || 4;

    // Queries independientes en paralelo
    const [trends, overall] = await Promise.all([
      db.queryAll(
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
      ),
      db.queryOne(
        `SELECT
           COUNT(*) AS total_entries,
           ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep,
           ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
           ROUND(AVG(mood)::numeric, 1) AS avg_mood,
           ROUND(AVG(exercise_minutes)::numeric, 0) AS avg_exercise
         FROM bio_checks
         WHERE date >= CURRENT_DATE - ($1 * 7)::integer`,
        [weeks]
      ),
    ]);

    res.json({ ok: true, data: { weeks: trends, overall } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  CORRELACIONES — Pearson entre metricas de salud (30 dias)
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bio/correlations ─ Correlaciones entre metricas
router.get('/correlations', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    // Obtener datos crudos de los ultimos N dias
    const data = await db.queryAll(
      `SELECT sleep_hours, energy_level, mood, exercise_minutes
       FROM bio_checks
       WHERE date >= CURRENT_DATE - $1
       ORDER BY date DESC`,
      [days]
    );

    if (data.length < 3) {
      return res.json({
        ok: true,
        data: null,
        message: 'Necesitas al menos 3 registros para calcular correlaciones',
        entries: data.length,
      });
    }

    // Extraer arrays numericos
    const sleep = data.map(d => parseFloat(d.sleep_hours));
    const energy = data.map(d => parseInt(d.energy_level));
    const mood = data.map(d => parseInt(d.mood));
    const exercise = data.map(d => parseInt(d.exercise_minutes));

    const correlations = {
      sleep_vs_energy: pearson(sleep, energy),
      sleep_vs_mood: pearson(sleep, mood),
      exercise_vs_energy: pearson(exercise, energy),
      exercise_vs_mood: pearson(exercise, mood),
      sleep_vs_exercise: pearson(sleep, exercise),
      energy_vs_mood: pearson(energy, mood),
    };

    const insights = generateCorrelationInsights(correlations);

    res.json({
      ok: true,
      data: {
        period_days: days,
        entries: data.length,
        correlations,
        insights,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  ALERTAS — Deteccion de patrones negativos
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bio/alerts ─ Alertas de salud ─────────────
router.get('/alerts', async (req, res) => {
  try {
    // Promedios de los ultimos 3 dias
    const recent = await db.queryOne(
      `SELECT
         COUNT(*) as entries,
         ROUND(AVG(sleep_hours)::numeric, 1) as avg_sleep,
         ROUND(AVG(energy_level)::numeric, 1) as avg_energy,
         ROUND(AVG(mood)::numeric, 1) as avg_mood,
         ROUND(AVG(exercise_minutes)::numeric, 0) as avg_exercise
       FROM bio_checks
       WHERE date >= CURRENT_DATE - 3`
    );

    let alerts = [];

    if (recent && parseInt(recent.entries) > 0) {
      alerts = generateBioAlerts({
        avg_sleep: parseFloat(recent.avg_sleep),
        avg_energy: parseFloat(recent.avg_energy),
        avg_mood: parseFloat(recent.avg_mood),
        avg_exercise: parseFloat(recent.avg_exercise),
      });
    }

    res.json({
      ok: true,
      data: {
        period: '3 dias',
        averages: recent,
        alerts,
        alert_count: alerts.length,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bio ─ Registrar check diario ─────────────
router.post('/', async (req, res) => {
  try {
    const { date, sleep_hours, energy_level, mood, exercise_minutes, notes } = req.body;

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
        date || toDateStr(),
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
