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
};
