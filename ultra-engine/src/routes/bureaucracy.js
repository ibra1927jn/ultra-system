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
    const rows = await require('../domain/bureaucracy').listTaxDeadlines({
      country,
      onlyUpcoming: upcoming === 'true',
    });
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
    const status = await require('../domain/bureaucracy').getSchengenStatus(req.query.date);
    res.json({ ok: true, data: status });
  } catch (err) {
    res.status(err.message === 'date inválida' ? 400 : 500).json({ ok: false, error: err.message });
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

// ─── GET /api/bureaucracy/tax-deadlines.ics ─────────────────
//   Exporta deadlines fiscales en formato iCalendar para suscribir
//   desde Google Calendar / Apple Calendar / cualquier cliente CalDAV.
//   URL: GET /api/bureaucracy/tax-deadlines.ics?country=NZ
router.get('/tax-deadlines.ics', async (req, res) => {
  try {
    const { country } = req.query;
    const where = country ? 'WHERE country = $1' : '';
    const params = country ? [country.toUpperCase()] : [];
    const rows = await db.queryAll(
      `SELECT id, country, name, deadline_date, frequency, description, currency
       FROM bur_tax_deadlines ${where}
       ORDER BY deadline_date`,
      params
    );

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//UltraSystem//Tax Deadlines//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Ultra Tax Deadlines${country ? ' ' + country : ''}`,
    ];
    for (const r of rows) {
      const date = (r.deadline_date instanceof Date ? r.deadline_date.toISOString() : String(r.deadline_date)).slice(0, 10).replace(/-/g, '');
      const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      lines.push(
        'BEGIN:VEVENT',
        `UID:tax-${r.id}@ultra-system`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${date}`,
        `SUMMARY:[${r.country}] ${(r.name || '').replace(/[\r\n,;]/g, ' ')}`,
        `DESCRIPTION:${(r.description || '').replace(/[\r\n,;]/g, ' ')} (${r.frequency || ''})`,
        'END:VEVENT'
      );
    }
    lines.push('END:VCALENDAR');
    res.type('text/calendar').send(lines.join('\r\n'));
  } catch (err) {
    res.status(500).send(`ERROR: ${err.message}`);
  }
});

// ─── POST /api/bureaucracy/embassies/seed ─────────────────────
//   Seed embajadas relevantes (ES, DZ, NZ, AU). Idempotente.
router.post('/embassies/seed', async (_req, res) => {
  try {
    // R4 P4 expansion: 30+ embassies relevant to ES/DZ dual nationality + nomad routes
    // (NZ base + AU/MX/AR/CL/BR/UK/PT/IT/FR/DE/JP/SG/TH/VN/ID/MA primary destinations).
    // Source: maec.es + algerianembassy.org per country search.
    const seed = [
      // ─── ES representing in NZ/AU/Pacific (current base) ─────────
      { representing: 'ES', located_in: 'NZ', city: 'Wellington', address: '50 Manners Street', phone: '+64-4-802-5665', email: 'emb.wellington@maec.es', url: 'https://www.exteriores.gob.es/embajadas/wellington' },
      { representing: 'ES', located_in: 'NZ', type: 'consulate', city: 'Auckland', notes: 'Consulado honorario' },
      { representing: 'ES', located_in: 'AU', city: 'Canberra', address: '15 Arkana Street, Yarralumla', phone: '+61-2-6273-3555', email: 'emb.canberra@maec.es', url: 'https://www.exteriores.gob.es/embajadas/canberra' },
      { representing: 'ES', located_in: 'AU', type: 'consulate', city: 'Sydney', email: 'cog.sidney@maec.es' },
      { representing: 'ES', located_in: 'AU', type: 'consulate', city: 'Melbourne', email: 'cog.melbourne@maec.es' },

      // ─── ES representing in DZ + Maghreb ──────────────────────────
      { representing: 'ES', located_in: 'DZ', city: 'Argel', address: '46/46bis Boulevard Mohamed Khemisti', phone: '+213-21-92-12-22', url: 'https://www.exteriores.gob.es/embajadas/argel' },
      { representing: 'ES', located_in: 'DZ', type: 'consulate', city: 'Orán', email: 'cog.oran@maec.es' },
      { representing: 'ES', located_in: 'MA', city: 'Rabat', email: 'emb.rabat@maec.es', url: 'https://www.exteriores.gob.es/embajadas/rabat' },
      { representing: 'ES', located_in: 'TN', city: 'Túnez', email: 'emb.tunez@maec.es', url: 'https://www.exteriores.gob.es/embajadas/tunez' },

      // ─── ES representing in LatAm (DN routes) ─────────────────────
      { representing: 'ES', located_in: 'MX', city: 'Ciudad de México', email: 'emb.mexico@maec.es', url: 'https://www.exteriores.gob.es/embajadas/mexico' },
      { representing: 'ES', located_in: 'AR', city: 'Buenos Aires', email: 'emb.buenosaires@maec.es', url: 'https://www.exteriores.gob.es/embajadas/buenosaires' },
      { representing: 'ES', located_in: 'CL', city: 'Santiago', email: 'emb.santiago@maec.es', url: 'https://www.exteriores.gob.es/embajadas/santiago' },
      { representing: 'ES', located_in: 'CO', city: 'Bogotá', email: 'emb.bogota@maec.es', url: 'https://www.exteriores.gob.es/embajadas/bogota' },
      { representing: 'ES', located_in: 'PE', city: 'Lima', email: 'emb.lima@maec.es', url: 'https://www.exteriores.gob.es/embajadas/lima' },
      { representing: 'ES', located_in: 'BR', city: 'Brasília', email: 'emb.brasilia@maec.es', url: 'https://www.exteriores.gob.es/embajadas/brasilia' },

      // ─── ES representing in Asia/Pacific DN destinations ─────────
      { representing: 'ES', located_in: 'JP', city: 'Tokio', email: 'emb.tokio@maec.es', url: 'https://www.exteriores.gob.es/embajadas/tokio' },
      { representing: 'ES', located_in: 'SG', city: 'Singapur', email: 'emb.singapur@maec.es', url: 'https://www.exteriores.gob.es/embajadas/singapur' },
      { representing: 'ES', located_in: 'TH', city: 'Bangkok', email: 'emb.bangkok@maec.es', url: 'https://www.exteriores.gob.es/embajadas/bangkok' },
      { representing: 'ES', located_in: 'VN', city: 'Hanoi', email: 'emb.hanoi@maec.es', url: 'https://www.exteriores.gob.es/embajadas/hanoi' },
      { representing: 'ES', located_in: 'ID', city: 'Yakarta', email: 'emb.yakarta@maec.es', url: 'https://www.exteriores.gob.es/embajadas/yakarta' },
      { representing: 'ES', located_in: 'PH', city: 'Manila', email: 'emb.manila@maec.es', url: 'https://www.exteriores.gob.es/embajadas/manila' },

      // ─── ES representing in EU neighbors (frequent transit) ──────
      { representing: 'ES', located_in: 'PT', city: 'Lisboa', email: 'emb.lisboa@maec.es', url: 'https://www.exteriores.gob.es/embajadas/lisboa' },
      { representing: 'ES', located_in: 'FR', city: 'París', email: 'emb.paris@maec.es', url: 'https://www.exteriores.gob.es/embajadas/paris' },
      { representing: 'ES', located_in: 'IT', city: 'Roma', email: 'emb.roma@maec.es', url: 'https://www.exteriores.gob.es/embajadas/roma' },
      { representing: 'ES', located_in: 'DE', city: 'Berlín', email: 'emb.berlin@maec.es', url: 'https://www.exteriores.gob.es/embajadas/berlin' },
      { representing: 'ES', located_in: 'GB', city: 'Londres', email: 'emb.londres@maec.es', url: 'https://www.exteriores.gob.es/embajadas/londres' },

      // ─── DZ representing in primary destinations (segundo pasaporte) ─
      { representing: 'DZ', located_in: 'ES', city: 'Madrid', address: 'Calle General Oraá 12', phone: '+34-91-562-9707' },
      { representing: 'DZ', located_in: 'AU', city: 'Canberra', address: '9 Terrigal Crescent, O\'Malley', phone: '+61-2-6286-7355', url: 'http://www.algerianembassy.org.au' },
      { representing: 'DZ', located_in: 'NZ', type: 'consulate', city: 'Wellington', notes: 'Cobertura consular vía Canberra (no embajada propia)' },
      { representing: 'DZ', located_in: 'FR', city: 'París', notes: 'Mayor población DZ en Europa' },
      { representing: 'DZ', located_in: 'GB', city: 'Londres' },
      { representing: 'DZ', located_in: 'DE', city: 'Berlín' },
      { representing: 'DZ', located_in: 'IT', city: 'Roma' },
      { representing: 'DZ', located_in: 'BE', city: 'Bruselas' },
      { representing: 'DZ', located_in: 'CH', city: 'Berna' },
      { representing: 'DZ', located_in: 'TR', city: 'Ankara' },
      { representing: 'DZ', located_in: 'AE', city: 'Abu Dabi' },
      { representing: 'DZ', located_in: 'CA', city: 'Ottawa' },
      { representing: 'DZ', located_in: 'US', city: 'Washington' },
      { representing: 'DZ', located_in: 'BR', city: 'Brasília' },
      { representing: 'DZ', located_in: 'MX', city: 'Ciudad de México' },
      { representing: 'DZ', located_in: 'JP', city: 'Tokio' },
    ];
    let inserted = 0;
    for (const e of seed) {
      const r = await db.queryOne(
        `INSERT INTO bur_embassies (representing, located_in, type, city, address, phone, email, url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (representing, located_in, city) DO NOTHING RETURNING id`,
        [e.representing, e.located_in, e.type || 'embassy', e.city, e.address || null, e.phone || null, e.email || null, e.url || null]
      );
      if (r) inserted++;
    }
    res.json({ ok: true, inserted, total: seed.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

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

// ═══════════════════════════════════════════════════════════
//  R4 P4 Tier A — APOSTILLES (bur_apostilles)
//  CRUD: doc_name, doc_type, country_origin (ISO-2), issued/expiry,
//  apostille_number, paperless_id (link a doc OCR'd en P4), notes.
//  Lectura ordena por expiry asc → próximas a caducar primero.
// ═══════════════════════════════════════════════════════════
router.get('/apostilles', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, document_name, document_type, country_origin, issued_date, expiry_date,
              apostille_number, paperless_id, notes, is_active,
              CASE WHEN expiry_date IS NULL THEN NULL
                   ELSE (expiry_date - CURRENT_DATE) END AS days_until_expiry
       FROM bur_apostilles
       WHERE is_active = TRUE
       ORDER BY expiry_date ASC NULLS LAST`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/apostilles', async (req, res) => {
  try {
    const { document_name, document_type, country_origin, issued_date, expiry_date,
            apostille_number, paperless_id, notes } = req.body;
    if (!document_name || !country_origin) {
      return res.status(400).json({ ok: false, error: 'document_name + country_origin obligatorios' });
    }
    const row = await db.queryOne(
      `INSERT INTO bur_apostilles
         (document_name, document_type, country_origin, issued_date, expiry_date,
          apostille_number, paperless_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [document_name.slice(0, 200), document_type || null, country_origin.toUpperCase().slice(0, 2),
       issued_date || null, expiry_date || null, apostille_number || null,
       paperless_id || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/apostilles/:id', async (req, res) => {
  try {
    const allowed = ['document_name','document_type','country_origin','issued_date','expiry_date',
                     'apostille_number','paperless_id','notes','is_active'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (k in req.body) {
        params.push(k === 'country_origin' && req.body[k] ? req.body[k].toUpperCase() : req.body[k]);
        sets.push(`${k}=$${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'no fields to update' });
    params.push(req.params.id);
    const row = await db.queryOne(
      `UPDATE bur_apostilles SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!row) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/apostilles/:id', async (req, res) => {
  try {
    // Soft delete (apostilles tienen valor histórico, no hard-delete)
    const row = await db.queryOne(
      `UPDATE bur_apostilles SET is_active=FALSE WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  R4 P4 Tier A — DRIVER LICENSES (bur_driver_licenses)
//  Multi-país (NZ class 1, ES B, DZ, AU, etc). Tracking expiry +
//  classes (text array, p.ej. ['B','C','D']). Cron alerta < 60d.
// ═══════════════════════════════════════════════════════════
router.get('/driver-licenses', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, country, license_number, issued_date, expiry_date, classes, notes, is_active,
              (expiry_date - CURRENT_DATE) AS days_until_expiry
       FROM bur_driver_licenses
       WHERE is_active = TRUE
       ORDER BY expiry_date ASC`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/driver-licenses', async (req, res) => {
  try {
    const { country, license_number, issued_date, expiry_date, classes, notes } = req.body;
    if (!country || !expiry_date) {
      return res.status(400).json({ ok: false, error: 'country + expiry_date obligatorios' });
    }
    // classes: acepta array o string CSV
    let classesArr = null;
    if (Array.isArray(classes)) classesArr = classes;
    else if (typeof classes === 'string' && classes.trim()) classesArr = classes.split(',').map(s => s.trim());

    const row = await db.queryOne(
      `INSERT INTO bur_driver_licenses
         (country, license_number, issued_date, expiry_date, classes, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [country.toUpperCase().slice(0, 2), license_number || null, issued_date || null,
       expiry_date, classesArr, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/driver-licenses/:id', async (req, res) => {
  try {
    const allowed = ['country','license_number','issued_date','expiry_date','classes','notes','is_active'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (k in req.body) {
        let v = req.body[k];
        if (k === 'country' && v) v = v.toUpperCase();
        if (k === 'classes' && typeof v === 'string') v = v.split(',').map(s => s.trim());
        params.push(v);
        sets.push(`${k}=$${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'no fields' });
    params.push(req.params.id);
    const row = await db.queryOne(
      `UPDATE bur_driver_licenses SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!row) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/driver-licenses/:id', async (req, res) => {
  try {
    const row = await db.queryOne(
      `UPDATE bur_driver_licenses SET is_active=FALSE WHERE id=$1 RETURNING id`,
      [req.params.id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  R4 P4 Tier A — MILITARY OBLIGATIONS (bur_military_obligations)
//  Caso uso primario: DZ obliga servicio militar a varones <30
//  con dispensa por residencia/estudios/edad. Tracking del estado
//  + documento de exención + expiry (algunas dispensas caducan).
// ═══════════════════════════════════════════════════════════
router.get('/military', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, country, obligation_type, status, document_number,
              issue_date, expiry_date, notes,
              CASE WHEN expiry_date IS NULL THEN NULL
                   ELSE (expiry_date - CURRENT_DATE) END AS days_until_expiry
       FROM bur_military_obligations
       ORDER BY expiry_date ASC NULLS LAST`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/military', async (req, res) => {
  try {
    const { country, obligation_type, status, document_number, issue_date, expiry_date, notes } = req.body;
    if (!country) return res.status(400).json({ ok: false, error: 'country obligatorio' });
    const row = await db.queryOne(
      `INSERT INTO bur_military_obligations
         (country, obligation_type, status, document_number, issue_date, expiry_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [country.toUpperCase().slice(0, 2), obligation_type || null, status || null,
       document_number || null, issue_date || null, expiry_date || null, notes || null]
    );
    res.status(201).json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.patch('/military/:id', async (req, res) => {
  try {
    const allowed = ['country','obligation_type','status','document_number','issue_date','expiry_date','notes'];
    const sets = [], params = [];
    for (const k of allowed) {
      if (k in req.body) {
        params.push(k === 'country' && req.body[k] ? req.body[k].toUpperCase() : req.body[k]);
        sets.push(`${k}=$${params.length}`);
      }
    }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'no fields' });
    params.push(req.params.id);
    const row = await db.queryOne(
      `UPDATE bur_military_obligations SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!row) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.delete('/military/:id', async (req, res) => {
  try {
    const r = await db.query(`DELETE FROM bur_military_obligations WHERE id=$1`, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ ok: false, error: 'not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
