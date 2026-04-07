// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Bio-Check (P7)                      ║
// ║  Seguimiento salud + correlaciones + alertas             ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const healthCheck = require('../health_destination_check');
const wger = require('../wger');
const off = require('../openfoodfacts');

const router = express.Router();

// ─── GET /api/bio/exercises ─ Search wger ────────────────
router.get('/exercises', async (req, res) => {
  try {
    const { q, limit } = req.query;
    if (q) {
      const results = await wger.searchExercises({ q, limit: parseInt(limit || '20', 10) });
      return res.json({ ok: true, count: results.length, data: results });
    }
    // List from local cache si exists
    try {
      const rows = await db.queryAll(
        `SELECT id, name, category, muscles, equipment FROM bio_exercises ORDER BY id LIMIT $1`,
        [parseInt(limit || '50', 10)]
      );
      return res.json({ ok: true, source: 'cache', count: rows.length, data: rows });
    } catch {
      const live = await wger.listExercises({ limit: parseInt(limit || '50', 10) });
      return res.json({ ok: true, source: 'live', count: live.length, data: live });
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/exercises/sync', async (req, res) => {
  try {
    const result = await wger.syncExercises({ batchSize: 50, maxBatches: 10 });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/bio/food/barcode/:code ─ Lookup OFF ────────
router.get('/food/barcode/:code', async (req, res) => {
  try {
    const result = await off.lookupBarcode(req.params.code);
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/food/log', async (req, res) => {
  try {
    const { barcode, quantity_g, meal, notes } = req.body;
    if (!barcode || !quantity_g) return res.status(400).json({ ok: false, error: 'barcode y quantity_g requeridos' });
    const result = await off.logFood({ barcode, quantity_g, meal, notes });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P7 FASE 3b — Mental health (mood + journal + CBT prompts)
// ═══════════════════════════════════════════════════════════

router.get('/mood', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const rows = await db.queryAll(
      `SELECT id, logged_at, mood, energy, anxiety, tags, notes
       FROM bio_mood
       WHERE logged_at >= NOW() - INTERVAL '${days} days'
       ORDER BY logged_at DESC`
    );
    // Compute averages
    const avg = (k) => rows.length ? rows.reduce((a, r) => a + (parseFloat(r[k]) || 0), 0) / rows.length : null;
    res.json({
      ok: true, count: rows.length,
      averages: rows.length ? { mood: avg('mood'), energy: avg('energy'), anxiety: avg('anxiety') } : null,
      data: rows,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/mood', async (req, res) => {
  try {
    const { mood, energy, anxiety, tags, notes } = req.body;
    if (mood === undefined || mood < 1 || mood > 10) {
      return res.status(400).json({ ok: false, error: 'mood (1-10) requerido' });
    }
    const row = await db.queryOne(
      `INSERT INTO bio_mood (mood, energy, anxiety, tags, notes)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [mood, energy || null, anxiety || null, tags || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/journal', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const rows = await db.queryAll(
      `SELECT id, logged_at, title, body_md, tags, sentiment, cbt_prompt_id
       FROM bio_journal ORDER BY logged_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/journal', async (req, res) => {
  try {
    const { title, body_md, tags, cbt_prompt_id } = req.body;
    if (!body_md) return res.status(400).json({ ok: false, error: 'body_md requerido' });
    const row = await db.queryOne(
      `INSERT INTO bio_journal (title, body_md, tags, cbt_prompt_id)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [title, body_md, tags || null, cbt_prompt_id || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/cbt/random', async (req, res) => {
  try {
    const { category } = req.query;
    const where = category ? 'WHERE category=$1' : '';
    const params = category ? [category] : [];
    const row = await db.queryOne(
      `SELECT id, category, technique, prompt
       FROM bio_cbt_prompts ${where}
       ORDER BY RANDOM() LIMIT 1`,
      params
    );
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/cbt', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT category, technique, COUNT(*) as count FROM bio_cbt_prompts
       GROUP BY category, technique ORDER BY category`
    );
    res.json({ ok: true, total: rows.reduce((a, r) => a + parseInt(r.count, 10), 0), categories: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/food/today', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, logged_at, product_name, brand, quantity_g, meal, kcal, protein_g, carbs_g, fat_g, nutriscore
       FROM bio_food_log
       WHERE logged_at >= CURRENT_DATE
       ORDER BY logged_at DESC`
    );
    const totals = rows.reduce((a, r) => ({
      kcal: a.kcal + parseFloat(r.kcal || 0),
      protein_g: a.protein_g + parseFloat(r.protein_g || 0),
      carbs_g: a.carbs_g + parseFloat(r.carbs_g || 0),
      fat_g: a.fat_g + parseFloat(r.fat_g || 0),
    }), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    res.json({ ok: true, count: rows.length, totals, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/bio/destination-check?country=ID ───────────
router.get('/destination-check', async (req, res) => {
  try {
    const { country } = req.query;
    if (!country) return res.status(400).json({ ok: false, error: 'country requerido (ISO2)' });
    const result = await healthCheck.checkDestination(country);
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

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

    // Interpretacion humana
    const insights = [];
    for (const [key, val] of Object.entries(correlations)) {
      if (val === null) continue;
      const [a, , b] = key.split('_');
      const strength = Math.abs(val) >= 0.7 ? 'fuerte' : Math.abs(val) >= 0.4 ? 'moderada' : 'debil';
      const direction = val > 0 ? 'positiva' : 'negativa';
      if (Math.abs(val) >= 0.4) {
        insights.push(`${a}/${b}: correlacion ${strength} ${direction} (${val})`);
      }
    }

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

    const alerts = [];

    if (recent && parseInt(recent.entries) > 0) {
      const avgSleep = parseFloat(recent.avg_sleep);
      const avgEnergy = parseFloat(recent.avg_energy);
      const avgMood = parseFloat(recent.avg_mood);
      const avgExercise = parseFloat(recent.avg_exercise);

      if (avgSleep < 6) {
        alerts.push({
          type: 'sleep',
          severity: avgSleep < 5 ? 'critical' : 'warning',
          message: `Promedio de sueno bajo: ${avgSleep}h (ultimos 3 dias). Minimo recomendado: 7h`,
        });
      }

      if (avgEnergy < 4) {
        alerts.push({
          type: 'energy',
          severity: avgEnergy < 3 ? 'critical' : 'warning',
          message: `Energia baja: ${avgEnergy}/10 (ultimos 3 dias). Revisa sueno y alimentacion`,
        });
      }

      if (avgMood < 4) {
        alerts.push({
          type: 'mood',
          severity: avgMood < 3 ? 'critical' : 'warning',
          message: `Animo bajo: ${avgMood}/10 (ultimos 3 dias). Considera un descanso o cambio de rutina`,
        });
      }

      if (avgExercise < 10) {
        alerts.push({
          type: 'exercise',
          severity: 'info',
          message: `Poco ejercicio: ${avgExercise} min/dia (ultimos 3 dias). Intenta moverte mas`,
        });
      }
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

// ═══════════════════════════════════════════════════════════
//  UTILS — Correlacion de Pearson
// ═══════════════════════════════════════════════════════════

/**
 * Calcula coeficiente de correlacion de Pearson entre dos arrays
 * Retorna valor entre -1 y 1, o null si no se puede calcular
 */
function pearson(x, y) {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return null;

  return Math.round((numerator / denominator) * 100) / 100;
}

// ═══════════════════════════════════════════════════════════
//  P7 Phase 1 Quick Win — Health alerts + external services
// ═══════════════════════════════════════════════════════════
const healthScrapers = require('../health_scrapers');
const externalHealth = require('../external_health');

router.get('/health-alerts', async (req, res) => {
  try {
    const { country, limit } = req.query;
    const rows = await healthScrapers.listAlerts(
      country ? country.toUpperCase() : null,
      parseInt(limit) || 20
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/health-alerts/refresh', async (req, res) => {
  try {
    const r = await healthScrapers.fetchAll();
    res.json({ ok: true, data: r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/external-status', async (req, res) => {
  try {
    res.json({ ok: true, data: await externalHealth.getStatus() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/external-status/probe', async (req, res) => {
  try {
    res.json({ ok: true, data: await externalHealth.probeAll() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/health-documents', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, doc_type, date, country, provider, title, paperless_id, tags, notes, created_at
       FROM health_documents ORDER BY date DESC LIMIT 50`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/health-documents', async (req, res) => {
  try {
    const { doc_type, date, country, provider, title, file_path, paperless_id, metadata, tags, notes } = req.body;
    if (!doc_type || !date || !title) {
      return res.status(400).json({ ok: false, error: 'doc_type, date, title requeridos' });
    }
    const row = await db.queryOne(
      `INSERT INTO health_documents (doc_type, date, country, provider, title, file_path, paperless_id, metadata, tags, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [doc_type, date, country?.toUpperCase() || null, provider || null, title,
       file_path || null, paperless_id || null, metadata || null, tags || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
