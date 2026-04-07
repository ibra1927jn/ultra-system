// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Bureaucracy (P4)                    ║
// ║  Tax deadlines + vaccinations (P4 owns ambas, decisión   ║
// ║  2026-04-07; P7 consume vaccinations vía evento)          ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');
const schengen = require('../schengen');
const cdio = require('../changedetection');
const paperless = require('../paperless');

const router = express.Router();

// ═══════════════════════════════════════════════════════════
//  TAX DEADLINES (bur_tax_deadlines)
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bureaucracy/tax-deadlines ──────────────────
router.get('/tax-deadlines', async (req, res) => {
  try {
    const { country, upcoming } = req.query;
    const params = [];
    const where = ['is_active = TRUE'];

    if (country) {
      params.push(country.toUpperCase());
      where.push(`country = $${params.length}`);
    }
    if (upcoming === 'true') {
      where.push('deadline >= CURRENT_DATE');
    }

    const rows = await db.queryAll(
      `SELECT id, country, name, description, deadline, recurring,
              recurrence_rule, alert_days_array, is_active, notes,
              (deadline - CURRENT_DATE) AS days_remaining,
              created_at, updated_at
       FROM bur_tax_deadlines
       WHERE ${where.join(' AND ')}
       ORDER BY deadline ASC`,
      params
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bureaucracy/tax-deadlines ─────────────────
router.post('/tax-deadlines', async (req, res) => {
  try {
    const {
      country, name, description, deadline,
      recurring, recurrence_rule, alert_days_array, notes,
    } = req.body;

    if (!country || !name || !deadline) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan campos obligatorios: country, name, deadline',
      });
    }

    const row = await db.queryOne(
      `INSERT INTO bur_tax_deadlines
       (country, name, description, deadline, recurring, recurrence_rule, alert_days_array, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        country.toUpperCase(),
        name,
        description || null,
        deadline,
        recurring !== false,
        recurrence_rule || 'YEARLY',
        alert_days_array || [30, 14, 7, 1],
        notes || null,
      ]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/bureaucracy/tax-deadlines/:id ──────────────
router.put('/tax-deadlines/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      country, name, description, deadline, recurring,
      recurrence_rule, alert_days_array, is_active, notes,
    } = req.body;

    const row = await db.queryOne(
      `UPDATE bur_tax_deadlines SET
         country = COALESCE($1, country),
         name = COALESCE($2, name),
         description = COALESCE($3, description),
         deadline = COALESCE($4, deadline),
         recurring = COALESCE($5, recurring),
         recurrence_rule = COALESCE($6, recurrence_rule),
         alert_days_array = COALESCE($7, alert_days_array),
         is_active = COALESCE($8, is_active),
         notes = COALESCE($9, notes),
         updated_at = NOW()
       WHERE id = $10
       RETURNING *`,
      [
        country ? country.toUpperCase() : null,
        name, description, deadline, recurring,
        recurrence_rule, alert_days_array, is_active, notes, id,
      ]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Tax deadline no encontrado' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/bureaucracy/tax-deadlines/:id ───────────
router.delete('/tax-deadlines/:id', async (req, res) => {
  try {
    const row = await db.queryOne(
      'DELETE FROM bur_tax_deadlines WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Tax deadline no encontrado' });
    res.json({ ok: true, deleted: row.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  VACCINATIONS (bur_vaccinations) — P4 owns, P7 consumes
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bureaucracy/vaccinations ───────────────────
router.get('/vaccinations', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, vaccine, dose_number, date_given, location, country,
              batch_number, expiry_date, certificate_url, paperless_id, notes,
              CASE
                WHEN expiry_date IS NULL THEN NULL
                ELSE (expiry_date - CURRENT_DATE)
              END AS days_remaining,
              created_at, updated_at
       FROM bur_vaccinations
       ORDER BY date_given DESC`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bureaucracy/vaccinations ──────────────────
// Publica evento bur.vaccination_updated para que P7 lo consuma
router.post('/vaccinations', async (req, res) => {
  try {
    const {
      vaccine, dose_number, date_given, location, country,
      batch_number, expiry_date, certificate_url, paperless_id, notes,
    } = req.body;

    if (!vaccine || !date_given) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan campos obligatorios: vaccine, date_given',
      });
    }

    const row = await db.queryOne(
      `INSERT INTO bur_vaccinations
       (vaccine, dose_number, date_given, location, country, batch_number,
        expiry_date, certificate_url, paperless_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        vaccine,
        dose_number || null,
        date_given,
        location || null,
        country ? country.toUpperCase() : null,
        batch_number || null,
        expiry_date || null,
        certificate_url || null,
        paperless_id || null,
        notes || null,
      ]
    );

    // ─── Publicar evento bur.vaccination_updated ─────────
    // P7 (bio-check) lo consume para cruzar con destinos planeados.
    await publishEvent('bur.vaccination_updated', 'P4', {
      vaccine: row.vaccine,
      dose_number: row.dose_number,
      country: row.country,
      expiry_date: row.expiry_date,
      vaccination_id: row.id,
    });

    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/bureaucracy/vaccinations/:id ───────────────
router.put('/vaccinations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      vaccine, dose_number, date_given, location, country,
      batch_number, expiry_date, certificate_url, paperless_id, notes,
    } = req.body;

    const row = await db.queryOne(
      `UPDATE bur_vaccinations SET
         vaccine = COALESCE($1, vaccine),
         dose_number = COALESCE($2, dose_number),
         date_given = COALESCE($3, date_given),
         location = COALESCE($4, location),
         country = COALESCE($5, country),
         batch_number = COALESCE($6, batch_number),
         expiry_date = COALESCE($7, expiry_date),
         certificate_url = COALESCE($8, certificate_url),
         paperless_id = COALESCE($9, paperless_id),
         notes = COALESCE($10, notes),
         updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [
        vaccine, dose_number, date_given, location,
        country ? country.toUpperCase() : null,
        batch_number, expiry_date, certificate_url, paperless_id, notes, id,
      ]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Vacunación no encontrada' });

    await publishEvent('bur.vaccination_updated', 'P4', {
      vaccine: row.vaccine,
      dose_number: row.dose_number,
      country: row.country,
      expiry_date: row.expiry_date,
      vaccination_id: row.id,
    });

    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/bureaucracy/vaccinations/:id ────────────
router.delete('/vaccinations/:id', async (req, res) => {
  try {
    const row = await db.queryOne(
      'DELETE FROM bur_vaccinations WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Vacunación no encontrada' });
    res.json({ ok: true, deleted: row.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  Helper: publish event to event_log (event bus minimal)
// ═══════════════════════════════════════════════════════════
async function publishEvent(eventType, sourcePillar, payload) {
  try {
    await db.query(
      `INSERT INTO event_log (event_type, source_pillar, data)
       VALUES ($1, $2, $3)`,
      [eventType, sourcePillar, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error('❌ Error publicando evento:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════
//  P4 FASE 2 — TRAVEL LOG (bur_travel_log)
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bureaucracy/travel-log ─────────────────────
router.get('/travel-log', async (req, res) => {
  try {
    const { country, area, ongoing } = req.query;
    const where = [];
    const params = [];
    if (country) {
      params.push(country.toUpperCase());
      where.push(`country = $${params.length}`);
    }
    if (area) {
      params.push(area.toUpperCase());
      where.push(`area = $${params.length}`);
    }
    if (ongoing === 'true') where.push('exit_date IS NULL');

    const rows = await db.queryAll(
      `SELECT id, country, area, entry_date, exit_date, purpose, passport_used, notes, source,
              CASE WHEN exit_date IS NULL THEN (CURRENT_DATE - entry_date) + 1
                   ELSE (exit_date - entry_date) + 1 END AS days
       FROM bur_travel_log
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY entry_date DESC`,
      params
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bureaucracy/travel-log ────────────────────
router.post('/travel-log', async (req, res) => {
  try {
    const { country, area, entry_date, exit_date, purpose, passport_used, notes, source } = req.body;
    if (!country || !entry_date) {
      return res.status(400).json({ ok: false, error: 'country y entry_date son obligatorios' });
    }
    // Auto-detectar area Schengen si no se pasa
    let detectedArea = area || null;
    if (!detectedArea && schengen.SCHENGEN_COUNTRIES.has(country.toUpperCase())) {
      detectedArea = 'SCHENGEN';
    }
    const row = await db.queryOne(
      `INSERT INTO bur_travel_log
       (country, area, entry_date, exit_date, purpose, passport_used, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        country.toUpperCase(),
        detectedArea,
        entry_date,
        exit_date || null,
        purpose || null,
        passport_used ? passport_used.toUpperCase() : null,
        notes || null,
        source || 'manual',
      ]
    );
    await publishEvent('bur.travel_logged', 'P4', {
      trip_id: row.id, country: row.country, area: row.area,
      entry_date: row.entry_date, exit_date: row.exit_date,
    });
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/bureaucracy/travel-log/:id ─────────────────
router.put('/travel-log/:id', async (req, res) => {
  try {
    const { country, area, entry_date, exit_date, purpose, passport_used, notes } = req.body;
    const row = await db.queryOne(
      `UPDATE bur_travel_log SET
         country = COALESCE($1, country),
         area = COALESCE($2, area),
         entry_date = COALESCE($3, entry_date),
         exit_date = COALESCE($4, exit_date),
         purpose = COALESCE($5, purpose),
         passport_used = COALESCE($6, passport_used),
         notes = COALESCE($7, notes)
       WHERE id = $8 RETURNING *`,
      [
        country ? country.toUpperCase() : null,
        area, entry_date, exit_date, purpose,
        passport_used ? passport_used.toUpperCase() : null,
        notes, req.params.id,
      ]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Trip no encontrado' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/bureaucracy/travel-log/:id ──────────────
router.delete('/travel-log/:id', async (req, res) => {
  try {
    const row = await db.queryOne(
      'DELETE FROM bur_travel_log WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Trip no encontrado' });
    res.json({ ok: true, deleted: row.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P4 FASE 2 — SCHENGEN 90/180 CALCULATOR
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bureaucracy/schengen?date=YYYY-MM-DD ───────
router.get('/schengen', async (req, res) => {
  try {
    const targetDate = req.query.date ? new Date(req.query.date) : new Date();
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ ok: false, error: 'date inválida (formato YYYY-MM-DD)' });
    }
    const status = await schengen.getSchengenStatus(targetDate);
    res.json({ ok: true, data: status });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P4 FASE 2 — VISA MATRIX (passport-index)
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bureaucracy/visa?from=ES&to=NZ ─────────────
// from = passport (ES|DZ); to = destination ISO2.
// Si solo `from` → lista todos los destinos del pasaporte.
router.get('/visa', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from) return res.status(400).json({ ok: false, error: 'Falta parámetro `from` (passport ISO2)' });

    if (to) {
      const row = await db.queryOne(
        `SELECT * FROM bur_visa_matrix WHERE passport = $1 AND destination = $2`,
        [from.toUpperCase(), to.toUpperCase()]
      );
      if (!row) return res.status(404).json({ ok: false, error: 'No hay datos para ese par. Datos disponibles: ES, DZ' });
      return res.json({ ok: true, data: row });
    }

    const rows = await db.queryAll(
      `SELECT * FROM bur_visa_matrix WHERE passport = $1 ORDER BY destination`,
      [from.toUpperCase()]
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bureaucracy/visa-matrix ───────────────────
// Upsert manual de entradas (para curación o expansión a más pasaportes)
router.post('/visa-matrix', async (req, res) => {
  try {
    const { passport, destination, requirement, days_allowed, notes } = req.body;
    if (!passport || !destination || !requirement) {
      return res.status(400).json({ ok: false, error: 'passport, destination, requirement son obligatorios' });
    }
    const row = await db.queryOne(
      `INSERT INTO bur_visa_matrix (passport, destination, requirement, days_allowed, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (passport, destination) DO UPDATE SET
         requirement = EXCLUDED.requirement,
         days_allowed = EXCLUDED.days_allowed,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING *`,
      [passport.toUpperCase(), destination.toUpperCase(), requirement, days_allowed || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P4 FASE 2 — GOV WATCHES (changedetection.io)
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bureaucracy/gov-watches ────────────────────
router.get('/gov-watches', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, label, url, country, category, cdio_uuid, is_active,
              last_changed_at, last_check_at, notes, created_at
       FROM bur_gov_watches ORDER BY country, label`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bureaucracy/gov-watches ───────────────────
router.post('/gov-watches', async (req, res) => {
  try {
    const { label, url, country, category, notes } = req.body;
    if (!label || !url) {
      return res.status(400).json({ ok: false, error: 'label y url son obligatorios' });
    }
    const row = await db.queryOne(
      `INSERT INTO bur_gov_watches (label, url, country, category, notes)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (url) DO UPDATE SET label=EXCLUDED.label, notes=EXCLUDED.notes
       RETURNING *`,
      [label, url, country ? country.toUpperCase() : null, category || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bureaucracy/gov-watches/sync ──────────────
// Sincroniza watches locales hacia changedetection.io
router.post('/gov-watches/sync', async (req, res) => {
  try {
    const result = await cdio.syncWatches();
    res.json({ ok: result.ok !== false, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/bureaucracy/gov-changes ────────────────────
router.get('/gov-changes', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT c.id, c.detected_at, c.diff_summary, w.label, w.url, w.country, w.category
       FROM bur_gov_changes c
       LEFT JOIN bur_gov_watches w ON c.watch_id = w.id
       ORDER BY c.detected_at DESC LIMIT 30`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P4 FASE 2 — PAPERLESS-NGX BRIDGE
// ═══════════════════════════════════════════════════════════

// ─── GET /api/bureaucracy/paperless/status ───────────────
router.get('/paperless/status', async (req, res) => {
  try {
    const reachable = await paperless.isReachable();
    if (!reachable) {
      return res.json({ ok: false, reachable: false });
    }
    const stats = await paperless.getStats();
    res.json({ ok: true, reachable: true, stats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/bureaucracy/paperless/documents ────────────
router.get('/paperless/documents', async (req, res) => {
  try {
    const { query, page } = req.query;
    const data = await paperless.listDocuments({
      query, page: parseInt(page || '1', 10), page_size: 25,
    });
    res.json({ ok: true, data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/bureaucracy/paperless/link ────────────────
// Sube un fichero local (path en server) y linkea a un row existente.
// Body: { filepath, title, target_table, target_id }
router.post('/paperless/link', async (req, res) => {
  try {
    const { filepath, title, target_table, target_id, tags } = req.body;
    if (!filepath || !target_table || !target_id) {
      return res.status(400).json({ ok: false, error: 'filepath, target_table, target_id obligatorios' });
    }
    const result = await paperless.uploadAndLink({
      filepath, title, targetTable: target_table, targetId: target_id, tags: tags || [],
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P4 FASE 3b — EMBASSIES + CONSULAR REGISTRATIONS
// ═══════════════════════════════════════════════════════════

router.get('/embassies', async (req, res) => {
  try {
    const { representing, located_in, city } = req.query;
    const where = [];
    const params = [];
    if (representing) { params.push(representing.toUpperCase()); where.push(`representing=$${params.length}`); }
    if (located_in) { params.push(located_in.toUpperCase()); where.push(`located_in=$${params.length}`); }
    if (city) { params.push('%' + city + '%'); where.push(`city ILIKE $${params.length}`); }
    const rows = await db.queryAll(
      `SELECT id, representing, located_in, type, city, address, phone, email, url, hours, notes
       FROM bur_embassies
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY representing, located_in, city`,
      params
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/embassies', async (req, res) => {
  try {
    const { representing, located_in, type, city, address, phone, email, url, hours, notes } = req.body;
    if (!representing || !located_in || !city) {
      return res.status(400).json({ ok: false, error: 'representing, located_in, city son obligatorios' });
    }
    const row = await db.queryOne(
      `INSERT INTO bur_embassies (representing, located_in, type, city, address, phone, email, url, hours, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (representing, located_in, city) DO UPDATE SET
         address=EXCLUDED.address, phone=EXCLUDED.phone, email=EXCLUDED.email,
         url=EXCLUDED.url, hours=EXCLUDED.hours, notes=EXCLUDED.notes
       RETURNING *`,
      [representing.toUpperCase(), located_in.toUpperCase(), type || 'embassy', city, address, phone, email, url, hours, notes]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/consular-registrations', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT cr.id, cr.type, cr.country, cr.registered_at, cr.expires_at,
              cr.document_number, cr.notes, cr.is_active,
              CASE WHEN cr.expires_at IS NULL THEN NULL
                   ELSE (cr.expires_at - CURRENT_DATE) END AS days_remaining,
              e.city AS embassy_city, e.url AS embassy_url
       FROM bur_consular_registrations cr
       LEFT JOIN bur_embassies e ON cr.embassy_id = e.id
       WHERE cr.is_active = TRUE
       ORDER BY cr.expires_at NULLS LAST`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/consular-registrations', async (req, res) => {
  try {
    const { type, country, embassy_id, registered_at, expires_at, document_number, notes } = req.body;
    if (!type || !country) return res.status(400).json({ ok: false, error: 'type y country obligatorios' });
    const row = await db.queryOne(
      `INSERT INTO bur_consular_registrations
         (type, country, embassy_id, registered_at, expires_at, document_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [type, country.toUpperCase(), embassy_id, registered_at, expires_at, document_number, notes]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
