// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Bureaucracy (P4)                    ║
// ║  Tax deadlines + vaccinations (P4 owns ambas, decisión   ║
// ║  2026-04-07; P7 consume vaccinations vía evento)          ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

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

module.exports = router;
