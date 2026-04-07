// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — spaCy NER sidecar client                  ║
// ║                                                            ║
// ║  Thin HTTP client for the python:spacy container (8009).  ║
// ║  Used opt-in by nlp.extractEntitiesSpacy() para contenido ║
// ║  importante. Si el sidecar no responde, el caller hace    ║
// ║  fallback a compromise.js.                                ║
// ╚══════════════════════════════════════════════════════════╝

const SPACY_BASE_URL = process.env.SPACY_BASE_URL || 'http://spacy:8000';
const TIMEOUT_MS = Number(process.env.SPACY_TIMEOUT_MS || 5000);

async function fetchWithTimeout(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Llama al endpoint /ner del sidecar. Devuelve null si falla
 * (timeout, container down, http error). Caller debe fallback.
 */
async function ner(text, lang = 'en') {
  if (!text || String(text).length < 3) return null;
  try {
    const r = await fetchWithTimeout(`${SPACY_BASE_URL}/ner`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: String(text).slice(0, 10000), lang }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function health() {
  try {
    const r = await fetchWithTimeout(`${SPACY_BASE_URL}/health`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

module.exports = { ner, health, SPACY_BASE_URL };
