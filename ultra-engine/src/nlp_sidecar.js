// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — NLP transformers sidecar client (B8)     ║
// ║                                                            ║
// ║  Thin HTTP client for the ultra_nlp container (port 8011  ║
// ║  on host, 8000 inside ultra_net). Lazy LRU on the python  ║
// ║  side means first call to a model can take 10-30s while   ║
// ║  it loads — timeouts are generous.                         ║
// ║                                                            ║
// ║  Caller convention: returns null on any failure (timeout,  ║
// ║  503, parse error). Callers must treat NLP enrichment as   ║
// ║  best-effort and never block ingest on it.                 ║
// ╚══════════════════════════════════════════════════════════╝

'use strict';

const NLP_BASE_URL = process.env.NLP_BASE_URL || 'http://nlp:8000';
const TIMEOUT_FAST_MS = Number(process.env.NLP_TIMEOUT_FAST_MS || 8_000);
const TIMEOUT_LOAD_MS = Number(process.env.NLP_TIMEOUT_LOAD_MS || 60_000);

// Per-model circuit breaker. After CB_THRESHOLD failures we stop
// calling that endpoint for CB_COOLDOWN_MS so we don't hammer a
// degraded sidecar (e.g. mid-restart, OOM-killed).
const CB_THRESHOLD = 5;
const CB_COOLDOWN_MS = 60_000;
const _breaker = new Map(); // endpoint → { fails, openUntil }

function _breakerOk(endpoint) {
  const b = _breaker.get(endpoint);
  if (!b) return true;
  if (b.openUntil && Date.now() < b.openUntil) return false;
  return true;
}
function _breakerHit(endpoint, success) {
  const b = _breaker.get(endpoint) || { fails: 0, openUntil: 0 };
  if (success) {
    _breaker.set(endpoint, { fails: 0, openUntil: 0 });
    return;
  }
  b.fails += 1;
  if (b.fails >= CB_THRESHOLD) {
    b.openUntil = Date.now() + CB_COOLDOWN_MS;
    b.fails = 0;
  }
  _breaker.set(endpoint, b);
}

async function _post(endpoint, body, { timeoutMs = TIMEOUT_FAST_MS } = {}) {
  if (!_breakerOk(endpoint)) return null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${NLP_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) {
      _breakerHit(endpoint, false);
      return null;
    }
    const json = await r.json();
    _breakerHit(endpoint, true);
    return json;
  } catch {
    _breakerHit(endpoint, false);
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function health() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 3_000);
  try {
    const r = await fetch(`${NLP_BASE_URL}/health`, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function classify(text, labels, { multiLabel = false } = {}) {
  if (!text || !Array.isArray(labels) || labels.length < 2) return null;
  return _post('/classify', { text, labels, multi_label: multiLabel }, { timeoutMs: TIMEOUT_LOAD_MS });
}

async function summarize(text, { maxLength = 130, minLength = 30 } = {}) {
  if (!text || String(text).length < 80) return null;
  return _post('/summarize', { text, max_length: maxLength, min_length: minLength }, { timeoutMs: TIMEOUT_LOAD_MS });
}

async function sentiment(text) {
  if (!text) return null;
  return _post('/sentiment', { text }, { timeoutMs: TIMEOUT_LOAD_MS });
}

async function embed(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return null;
  return _post('/embed', { texts }, { timeoutMs: TIMEOUT_LOAD_MS });
}

async function translate(text, srcLang = null) {
  if (!text) return null;
  return _post('/translate', { text, src_lang: srcLang }, { timeoutMs: TIMEOUT_LOAD_MS });
}

module.exports = {
  health,
  classify,
  summarize,
  sentiment,
  embed,
  translate,
  NLP_BASE_URL,
};
