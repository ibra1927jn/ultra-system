// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Documentos                          ║
// ║  CRUD de documentos + upload con OCR                     ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const multer = require('multer');
const db = require('../db');
const ocr = require('../ocr');

const router = express.Router();
const upload = multer({
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  storage: multer.memoryStorage(),
});

// ─── GET /api/documents ─ Listar documentos ──────────────
router.get('/', async (req, res) => {
  try {
    const docs = await db.queryAll(
      `SELECT id, document_name, document_type, expiry_date,
       alert_days, notes, is_active,
       (expiry_date - CURRENT_DATE) AS days_remaining,
       created_at, updated_at
       FROM document_alerts
       ORDER BY expiry_date ASC`
    );
    res.json({ ok: true, data: docs });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/documents ─ Crear alerta de documento ─────
router.post('/', async (req, res) => {
  try {
    const { document_name, document_type, expiry_date, alert_days, notes } = req.body;

    if (!document_name || !document_type || !expiry_date) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: document_name, document_type, expiry_date' });
    }

    const result = await db.queryOne(
      `INSERT INTO document_alerts (document_name, document_type, expiry_date, alert_days, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [document_name, document_type, expiry_date, alert_days || 60, notes || null]
    );
    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/documents/:id ─ Editar alerta ──────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { document_name, document_type, expiry_date, alert_days, notes, is_active } = req.body;

    const result = await db.queryOne(
      `UPDATE document_alerts SET
       document_name = COALESCE($1, document_name),
       document_type = COALESCE($2, document_type),
       expiry_date = COALESCE($3, expiry_date),
       alert_days = COALESCE($4, alert_days),
       notes = COALESCE($5, notes),
       is_active = COALESCE($6, is_active),
       updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [document_name, document_type, expiry_date, alert_days, notes, is_active, id]
    );

    if (!result) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── DELETE /api/documents/:id ─ Eliminar ────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.queryOne(
      'DELETE FROM document_alerts WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (!result) return res.status(404).json({ ok: false, error: 'Documento no encontrado' });
    res.json({ ok: true, deleted: result.id });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/documents/upload ─ Subir archivo + OCR ────
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'No se envió archivo' });

    // Guardar archivo
    const filePath = ocr.saveFile(req.file.buffer, req.file.originalname);

    // Extraer texto con OCR
    const ocrResult = await ocr.extractText(filePath);

    // Guardar en DB
    const saved = await db.queryOne(
      `INSERT INTO uploaded_files (original_name, stored_path, file_size, mime_type, ocr_text, ocr_confidence)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        req.file.originalname,
        filePath,
        req.file.size,
        req.file.mimetype,
        ocrResult.text,
        ocrResult.confidence,
      ]
    );

    res.status(201).json({
      ok: true,
      data: saved,
      ocr: { text: ocrResult.text.substring(0, 500), confidence: ocrResult.confidence, method: ocrResult.method },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/documents/files ─ Listar archivos subidos ──
router.get('/files', async (req, res) => {
  try {
    const files = await db.queryAll(
      'SELECT * FROM uploaded_files ORDER BY uploaded_at DESC LIMIT 50'
    );
    res.json({ ok: true, data: files });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
