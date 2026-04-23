// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Oportunidades (P5)                  ║
// ║  CRUD + pipeline + conversion rates + follow-up alerts   ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const eventbus = require('../eventbus');
const matching = require('../matching');

const router = express.Router();

// ─── GET /api/opportunities ─ Listar oportunidades ──────
router.get('/', async (req, res) => {
  try {
    const { status, category, limit, min_score, q } = req.query;
    // Fase 2 Work: filters min_score + q añadidos sin romper clientes previos.
    // duplicate_of filter siempre activo — los dupes no se muestran.
    let sql = 'SELECT * FROM opportunities WHERE duplicate_of IS NULL';
    const params = [];

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }

    const minScore = parseInt(min_score, 10);
    if (Number.isFinite(minScore) && minScore > 0) {
      params.push(minScore);
      sql += ` AND match_score >= $${params.length}`;
    }

    if (q && typeof q === 'string' && q.trim().length >= 2) {
      params.push(`%${q.trim()}%`);
      sql += ` AND (title ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    // Orden por score si hay filtro explícito, sino por recencia.
    sql += Number.isFinite(minScore) && minScore > 0
      ? ' ORDER BY match_score DESC NULLS LAST, posted_at DESC NULLS LAST'
      : ' ORDER BY created_at DESC';
    params.push(parseInt(limit) || 50);
    sql += ` LIMIT $${params.length}`;

    const rows = await db.queryAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  PIPELINE — Funnel de oportunidades con tasas de conversion
// ═══════════════════════════════════════════════════════════

// ─── GET /api/opportunities/pipeline ─ Funnel + rates ───
router.get('/pipeline', async (req, res) => {
  try {
    // Conteo por status
    const counts = await db.queryAll(
      `SELECT status, COUNT(*) as count
       FROM opportunities
       GROUP BY status
       ORDER BY
         CASE status
           WHEN 'new' THEN 1
           WHEN 'contacted' THEN 2
           WHEN 'applied' THEN 3
           WHEN 'rejected' THEN 4
           WHEN 'won' THEN 5
         END`
    );

    const total = await db.queryOne('SELECT COUNT(*) as total FROM opportunities');
    const totalCount = parseInt(total.total) || 0;

    // Mapa de conteos para calcular tasas
    const statusMap = {};
    for (const row of counts) {
      statusMap[row.status] = parseInt(row.count);
    }

    const contacted = statusMap['contacted'] || 0;
    const applied = statusMap['applied'] || 0;
    const rejected = statusMap['rejected'] || 0;
    const won = statusMap['won'] || 0;

    // Tasas de conversion (porcentaje sobre el total)
    const conversionRates = {
      new_to_contacted: totalCount > 0 ? Math.round((contacted + applied + won) / totalCount * 100) : 0,
      contacted_to_applied: (contacted + applied + won) > 0 ? Math.round((applied + won) / (contacted + applied + won) * 100) : 0,
      applied_to_won: (applied + won + rejected) > 0 ? Math.round(won / (applied + won + rejected) * 100) : 0,
      overall_win_rate: totalCount > 0 ? Math.round(won / totalCount * 100) : 0,
    };

    // Oportunidades que necesitan follow-up (contacted > 7 dias sin cambio)
    const needFollowUp = await db.queryAll(
      `SELECT id, title, source, created_at,
         (CURRENT_DATE - created_at::date) as days_since_created
       FROM opportunities
       WHERE status = 'contacted'
         AND created_at < NOW() - INTERVAL '7 days'
       ORDER BY created_at ASC`
    );

    // Deadlines proximos (3 dias)
    const upcomingDeadlines = await db.queryAll(
      `SELECT id, title, deadline, status,
         (deadline - CURRENT_DATE) as days_until
       FROM opportunities
       WHERE deadline IS NOT NULL
         AND deadline >= CURRENT_DATE
         AND deadline <= CURRENT_DATE + 3
         AND status NOT IN ('rejected', 'won')
       ORDER BY deadline ASC`
    );

    res.json({
      ok: true,
      data: {
        total: totalCount,
        by_status: counts,
        conversion_rates: conversionRates,
        need_follow_up: needFollowUp,
        upcoming_deadlines: upcomingDeadlines,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/opportunities ─ Crear oportunidad ────────
router.post('/', async (req, res) => {
  try {
    const { title, source, url, category, status, notes, deadline } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Falta campo obligatorio: title' });
    }

    const validStatuses = ['new', 'contacted', 'applied', 'rejected', 'won'];
    const finalStatus = validStatuses.includes(status) ? status : 'new';

    const result = await db.queryOne(
      `INSERT INTO opportunities (title, source, url, category, status, notes, deadline)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, source || null, url || null, category || null, finalStatus, notes || null, deadline || null]
    );

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/opportunities/:id ─ Actualizar ──────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, source, url, category, status, notes, deadline, estimated_value_nzd } = req.body;

    // Detectar transición a 'won' para publicar bridge event
    const prev = await db.queryOne('SELECT status FROM opportunities WHERE id=$1', [id]);

    const result = await db.queryOne(
      `UPDATE opportunities SET
       title = COALESCE($1, title),
       source = COALESCE($2, source),
       url = COALESCE($3, url),
       category = COALESCE($4, category),
       status = COALESCE($5, status),
       notes = COALESCE($6, notes),
       deadline = COALESCE($7, deadline)
       WHERE id = $8
       RETURNING *`,
      [title, source, url, category, status, notes, deadline, id]
    );

    if (!result) return res.status(404).json({ ok: false, error: 'Oportunidad no encontrada' });

    // P3 bridge: si transición a 'won', emitir evento con valor estimado
    if (status === 'won' && prev?.status !== 'won') {
      await eventbus.publish('opp.won', 'P5', {
        opportunity_id: result.id,
        title: result.title,
        estimated_value_nzd: estimated_value_nzd || result.salary_max || result.salary_min || 0,
      });
    }

    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P5 Phase 1 Quick Win — Multi-source remote fetchers
// ═══════════════════════════════════════════════════════════
const oppFetchers = require('../opp_fetchers');

router.post('/fetch', async (req, res) => {
  try {
    res.json({ ok: true, data: await oppFetchers.fetchAll() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/fetch/:source', async (req, res) => {
  try {
    const fnMap = {
      remoteok: oppFetchers.fetchRemoteOk,
      remotive: oppFetchers.fetchRemotive,
      himalayas: oppFetchers.fetchHimalayas,
      jobicy: oppFetchers.fetchJobicy,
      hn: oppFetchers.fetchHnWhoIsHiring,
      github: oppFetchers.fetchGithubBounties,
    };
    const fn = fnMap[req.params.source.toLowerCase()];
    if (!fn) return res.status(400).json({ ok: false, error: `Source desconocida. Opciones: ${Object.keys(fnMap).join(', ')}` });
    res.json({ ok: true, data: await fn() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/high-score', async (req, res) => {
  try {
    const minScore = parseInt(req.query.min_score) || 8;
    const limit = parseInt(req.query.limit) || 20;
    const result = await require('../domain/opportunities').getHighScoreOpps({ minScore, limit });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/by-source', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT source, count(*) AS total,
         count(*) FILTER (WHERE status='new') AS news,
         count(*) FILTER (WHERE status='applied') AS applied,
         count(*) FILTER (WHERE status='won') AS won,
         max(match_score) AS top_score,
         max(last_seen) AS last_fetched
       FROM opportunities
       WHERE source IS NOT NULL
       GROUP BY source ORDER BY total DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P5 FASE 2 — emp_profile + matching rescore
// ═══════════════════════════════════════════════════════════

router.get('/profile', async (req, res) => {
  try {
    const profile = await matching.getProfile();
    res.json({ ok: true, data: profile });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/profile', async (req, res) => {
  try {
    const { skills, languages, preferred_countries, preferred_sectors, min_salary_nzd, preferences } = req.body;
    const row = await db.queryOne(
      `UPDATE emp_profile SET
         skills = COALESCE($1, skills),
         languages = COALESCE($2, languages),
         preferred_countries = COALESCE($3, preferred_countries),
         preferred_sectors = COALESCE($4, preferred_sectors),
         min_salary_nzd = COALESCE($5, min_salary_nzd),
         preferences = COALESCE($6, preferences),
         updated_at = NOW()
       WHERE id = 1
       RETURNING *`,
      [
        skills ? JSON.stringify(skills) : null,
        languages ? JSON.stringify(languages) : null,
        preferred_countries || null,
        preferred_sectors || null,
        min_salary_nzd || null,
        preferences ? JSON.stringify(preferences) : null,
      ]
    );
    matching.clearCache();
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/match-rescore', async (req, res) => {
  try {
    const result = await matching.rescoreOpportunities();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
