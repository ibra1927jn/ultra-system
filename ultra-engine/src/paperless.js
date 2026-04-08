// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Paperless-ngx client (P4 Fase 2)         ║
// ║                                                            ║
// ║  REST API: https://docs.paperless-ngx.com/api/            ║
// ║  Token auth via /api/token/ → header Authorization Token  ║
// ║                                                            ║
// ║  Bridge con bur_documents/document_alerts/health_documents║
// ║  via la columna paperless_id ya existente en las 3 tablas.║
// ╚══════════════════════════════════════════════════════════╝

const fs = require('fs');
const path = require('path');
const db = require('./db');

const BASE_URL = process.env.PAPERLESS_BASE_URL || 'http://paperless:8000';
const ADMIN_USER = process.env.PAPERLESS_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.PAPERLESS_ADMIN_PASSWORD || 'changeme';

let cachedToken = null;

async function getToken() {
  if (cachedToken) return cachedToken;
  const r = await fetch(`${BASE_URL}/api/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASSWORD }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`paperless token failed: ${r.status} ${t.slice(0, 200)}`);
  }
  const data = await r.json();
  cachedToken = data.token;
  return cachedToken;
}

function clearToken() { cachedToken = null; }

async function authHeaders() {
  const token = await getToken();
  return { Authorization: `Token ${token}` };
}

async function isReachable() {
  try {
    const r = await fetch(`${BASE_URL}/api/`, { headers: await authHeaders() });
    return r.ok;
  } catch { return false; }
}

/**
 * Lista documentos. ?query=, ?ordering=-created, etc.
 */
async function listDocuments({ query, page = 1, page_size = 25 } = {}) {
  const headers = await authHeaders();
  const qs = new URLSearchParams({ page, page_size });
  if (query) qs.set('query', query);
  const r = await fetch(`${BASE_URL}/api/documents/?${qs}`, { headers });
  if (!r.ok) throw new Error(`paperless list failed: ${r.status}`);
  return r.json();
}

async function getDocument(id) {
  const headers = await authHeaders();
  const r = await fetch(`${BASE_URL}/api/documents/${id}/`, { headers });
  if (!r.ok) throw new Error(`paperless get failed: ${r.status}`);
  return r.json();
}

/**
 * Sube un documento a paperless por POST multipart.
 * file = Buffer; title opcional; tags array de IDs (opcional).
 *
 * Devuelve task_id. El doc final se procesa async — se debe pollear
 * /api/tasks/?task_id=... para resolver el document_id real.
 */
async function uploadDocument({ file, filename, title, tags = [] }) {
  const headers = await authHeaders();
  const form = new FormData();
  form.append('document', new Blob([file]), filename);
  if (title) form.append('title', title);
  for (const t of tags) form.append('tags', String(t));

  const r = await fetch(`${BASE_URL}/api/documents/post_document/`, {
    method: 'POST',
    headers, // no Content-Type — fetch FormData lo añade con boundary
    body: form,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`paperless upload failed: ${r.status} ${t.slice(0, 200)}`);
  }
  // Devuelve un task UUID como string
  const taskId = (await r.text()).replace(/"/g, '').trim();
  return { task_id: taskId };
}

/**
 * Polea /api/tasks/?task_id=... hasta resolver document_id.
 */
async function waitForTask(taskId, { maxAttempts = 30, intervalMs = 2000 } = {}) {
  const headers = await authHeaders();
  for (let i = 0; i < maxAttempts; i++) {
    const r = await fetch(`${BASE_URL}/api/tasks/?task_id=${taskId}`, { headers });
    if (r.ok) {
      const arr = await r.json();
      if (arr && arr.length) {
        const t = arr[0];
        if (t.status === 'SUCCESS' && t.related_document) {
          return { ok: true, document_id: parseInt(t.related_document, 10) };
        }
        if (t.status === 'FAILURE') {
          return { ok: false, error: t.result || 'task failed' };
        }
      }
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return { ok: false, error: 'timeout waiting for paperless task' };
}

/**
 * Sube un fichero local + linkea su paperless_id a un row de bur_documents
 * (document_alerts) o bur_vaccinations o health_documents.
 *
 * targetTable: 'document_alerts' | 'bur_vaccinations' | 'health_documents'
 */
async function uploadAndLink({ filepath, title, targetTable, targetId, tags = [] }) {
  const validTables = ['document_alerts', 'bur_vaccinations', 'health_documents'];
  if (!validTables.includes(targetTable)) {
    throw new Error(`targetTable inválida: ${targetTable}`);
  }
  const buffer = fs.readFileSync(filepath);
  const filename = path.basename(filepath);
  const { task_id } = await uploadDocument({ file: buffer, filename, title, tags });
  const result = await waitForTask(task_id);
  if (!result.ok) return result;

  await db.query(
    `UPDATE ${targetTable} SET paperless_id = $1 WHERE id = $2`,
    [result.document_id, targetId]
  );
  return { ok: true, paperless_id: result.document_id, target: { table: targetTable, id: targetId } };
}

// ════════════════════════════════════════════════════════════
//  P4 Fase 3c — OCR pipeline integration
// ════════════════════════════════════════════════════════════

/**
 * Extract dates from OCR text. Multi-format support:
 * - DD/MM/YYYY, DD-MM-YYYY (ES/EU)
 * - MM/DD/YYYY (US ambiguous — hereuristic: if first part > 12, treat as DD/MM)
 * - YYYY-MM-DD (ISO)
 * - "1 de enero de 2027" (Spanish written)
 * - "January 1, 2027" (English written)
 *
 * Returns array of { date: 'YYYY-MM-DD', context: '...' }
 */
function extractDates(text) {
  if (!text) return [];
  const found = [];
  const seen = new Set();

  const push = (year, month, day, context) => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (y < 2020 || y > 2050 || m < 1 || m > 12 || d < 1 || d > 31) return;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (seen.has(iso)) return;
    seen.add(iso);
    found.push({ date: iso, context: context.slice(0, 80) });
  };

  // ISO YYYY-MM-DD
  for (const m of text.matchAll(/(?<![\d/])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d/])/g)) {
    push(m[1], m[2], m[3], text.slice(Math.max(0, m.index - 30), m.index + 30));
  }
  // DD/MM/YYYY o DD-MM-YYYY (EU format)
  for (const m of text.matchAll(/(?<![\d/])(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?![\d/])/g)) {
    const a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    // Si a > 12, definitivamente día (DD/MM/YYYY)
    // Si b > 12, definitivamente mes invertido (MM/DD/YYYY)
    if (a > 12) push(m[3], m[2], m[1], text.slice(Math.max(0, m.index - 30), m.index + 30));
    else if (b > 12) push(m[3], m[1], m[2], text.slice(Math.max(0, m.index - 30), m.index + 30));
    else push(m[3], m[2], m[1], text.slice(Math.max(0, m.index - 30), m.index + 30)); // default EU
  }
  // Spanish written: "1 de enero de 2027"
  const monthsEs = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12 };
  for (const m of text.matchAll(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi)) {
    const month = monthsEs[m[2].toLowerCase()];
    if (month) push(m[3], month, m[1], text.slice(Math.max(0, m.index - 30), m.index + 50));
  }
  // English written: "January 1, 2027"
  const monthsEn = { january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
  for (const m of text.matchAll(/(\w+)\s+(\d{1,2}),?\s+(\d{4})/gi)) {
    const month = monthsEn[m[1].toLowerCase()];
    if (month) push(m[3], month, m[2], text.slice(Math.max(0, m.index - 30), m.index + 50));
  }
  return found;
}

/**
 * Try to identify expiry date from extracted dates by looking for nearby keywords.
 * Returns the best candidate or null.
 */
function inferExpiryDate(text) {
  if (!text) return null;
  const dates = extractDates(text);
  if (!dates.length) return null;
  // Score each date by proximity to expiry keywords
  const keywords = /(expir|valid until|valid through|caduca|vencimiento|válido hasta|valid hasta|expires|expiry|venc|fecha de caducidad|fin de vigencia|vigencia|until)/i;
  let best = null;
  let bestScore = -1;
  for (const d of dates) {
    const ctx = d.context.toLowerCase();
    let score = 0;
    if (keywords.test(ctx)) score += 10;
    // Future date bonus
    const dt = new Date(d.date);
    if (dt > new Date()) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = { ...d, score };
    }
  }
  return bestScore >= 5 ? best : null;
}

/**
 * Sync paperless documents → bur_documents (document_alerts).
 * Para cada doc en paperless sin link en local, intenta extraer expiry
 * date del OCR content y persistirla.
 */
async function syncOcrExtractions({ limit = 50 } = {}) {
  if (!(await isReachable())) return { ok: false, error: 'paperless no reachable' };
  let updated = 0;
  let scanned = 0;
  // List documents
  const data = await listDocuments({ page: 1, page_size: limit });
  for (const doc of (data.results || [])) {
    scanned++;
    if (!doc.content) continue;
    // Find row in document_alerts linked to this paperless_id
    const row = await db.queryOne(
      `SELECT id, expiry_date FROM document_alerts WHERE paperless_id = $1`,
      [doc.id]
    );
    if (!row) continue;
    // Skip si ya tiene expiry razonable
    if (row.expiry_date && new Date(row.expiry_date) > new Date()) continue;
    const inferred = inferExpiryDate(doc.content);
    if (inferred) {
      await db.query(
        `UPDATE document_alerts SET expiry_date = $1, notes = COALESCE(notes,'') || ' [OCR-extracted: ' || $2 || ']' WHERE id = $3`,
        [inferred.date, inferred.context.slice(0, 100), row.id]
      );
      updated++;
    }
  }
  return { ok: true, scanned, updated };
}

/**
 * Sync paperless documents → bur_documents.
 *
 * Para cada doc en paperless que NO esté ya linkeado en bur_documents
 * (verificamos via metadata->>'paperless_id'), inserta una row con los
 * campos básicos. doc_type se infiere de tags/title (default 'other').
 * El OCR text completo va a ocr_text, el inferred expiry_date a expiry_date.
 *
 * Idempotente: si paperless_id ya existe en metadata, hace UPDATE en vez de INSERT.
 *
 * Esta función cubre el gap descubierto 2026-04-08: el cron paperless-ocr-sync
 * solo enriquecía document_alerts existentes, nunca poblaba bur_documents.
 */
async function syncPaperlessToBurDocuments({ limit = 100 } = {}) {
  if (!(await isReachable())) return { ok: false, error: 'paperless no reachable' };

  const data = await listDocuments({ page: 1, page_size: limit });
  let inserted = 0, updated = 0, scanned = 0;

  for (const doc of (data.results || [])) {
    scanned++;

    // Buscar si ya existe link via metadata->>paperless_id
    const existing = await db.queryOne(
      `SELECT id FROM bur_documents WHERE metadata->>'paperless_id' = $1`,
      [String(doc.id)]
    );

    // Inferir doc_type del título/tags
    const titleLower = (doc.title || '').toLowerCase();
    let doc_type = 'other';
    if (/passport|pasaporte/.test(titleLower)) doc_type = 'passport';
    else if (/visa|visado/.test(titleLower)) doc_type = 'visa';
    else if (/license|licencia|permiso/.test(titleLower)) doc_type = 'license';
    else if (/insurance|seguro/.test(titleLower)) doc_type = 'insurance';
    else if (/contract|contrato/.test(titleLower)) doc_type = 'contract';
    else if (/invoice|factura|recibo/.test(titleLower)) doc_type = 'invoice';
    else if (/cert|certificate|certificado/.test(titleLower)) doc_type = 'certificate';
    else if (/tax|impuesto|hacienda/.test(titleLower)) doc_type = 'tax';

    const expiry = doc.content ? inferExpiryDate(doc.content) : null;
    const metadata = {
      paperless_id: doc.id,
      paperless_created: doc.created || null,
      paperless_modified: doc.modified || null,
      archived_file_name: doc.archived_file_name || null,
      ocr_extracted_at: new Date().toISOString(),
    };

    if (existing) {
      await db.query(
        `UPDATE bur_documents SET
           title = $1,
           ocr_text = $2,
           expiry_date = COALESCE(expiry_date, $3),
           metadata = metadata || $4::jsonb
         WHERE id = $5`,
        [
          (doc.title || `Paperless #${doc.id}`).slice(0, 500),
          doc.content || null,
          expiry?.date || null,
          JSON.stringify(metadata),
          existing.id,
        ]
      );
      updated++;
    } else {
      await db.query(
        `INSERT INTO bur_documents (title, doc_type, ocr_text, expiry_date, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          (doc.title || `Paperless #${doc.id}`).slice(0, 500),
          doc_type,
          doc.content || null,
          expiry?.date || null,
          JSON.stringify(metadata),
        ]
      );
      inserted++;
    }
  }

  return { ok: true, scanned, inserted, updated };
}

async function getStats() {
  try {
    const headers = await authHeaders();
    const r = await fetch(`${BASE_URL}/api/statistics/`, { headers });
    if (!r.ok) return null;
    return r.json();
  } catch { return null; }
}

module.exports = {
  isReachable,
  getToken,
  clearToken,
  listDocuments,
  getDocument,
  uploadDocument,
  waitForTask,
  uploadAndLink,
  getStats,
  extractDates,
  inferExpiryDate,
  syncOcrExtractions,
  syncPaperlessToBurDocuments,
};
