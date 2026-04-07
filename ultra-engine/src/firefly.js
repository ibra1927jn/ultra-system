// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Firefly III thin client (P3 R5+)         ║
// ║                                                            ║
// ║  Reemplaza progresivamente el ledger custom (`finances`).  ║
// ║  Decisión 2026-04-07: adoptar Firefly III como ledger      ║
// ║  primario; mantener finances table como bridge/fallback.   ║
// ║                                                            ║
// ║  Container: ultra_firefly (--profile firefly)              ║
// ║  Auth: Personal Access Token via FIREFLY_PERSONAL_TOKEN    ║
// ║  Setup manual: docs/FIREFLY_MIGRATION.md                   ║
// ╚══════════════════════════════════════════════════════════╝

const BASE = process.env.FIREFLY_BASE_URL || 'http://firefly_iii:8080';
const TOKEN = process.env.FIREFLY_PERSONAL_TOKEN || '';
const TIMEOUT = 15000;

function isConfigured() {
  return Boolean(TOKEN && TOKEN.length > 20);
}

function headers() {
  return {
    'Authorization': `Bearer ${TOKEN}`,
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/json',
  };
}

async function _request(method, path, body) {
  if (!isConfigured()) {
    return { ok: false, configured: false, error: 'FIREFLY_PERSONAL_TOKEN no configurado — ver docs/FIREFLY_MIGRATION.md' };
  }
  try {
    const opts = { method, headers: headers(), signal: AbortSignal.timeout(TIMEOUT) };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const r = await fetch(`${BASE}${path}`, opts);
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    if (!r.ok) {
      return { ok: false, status: r.status, error: data?.message || text.slice(0, 200) };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── ABOUT / Health ──────────────────────────────────────────
async function getAbout() {
  return _request('GET', '/api/v1/about');
}

// ─── ACCOUNTS ────────────────────────────────────────────────
async function listAccounts({ type } = {}) {
  const q = type ? `?type=${type}` : '';
  return _request('GET', `/api/v1/accounts${q}`);
}

async function createAccount({ name, type, currency_code = 'NZD', opening_balance = 0, account_role = 'defaultAsset' }) {
  return _request('POST', '/api/v1/accounts', {
    name, type, currency_code,
    opening_balance: String(opening_balance),
    opening_balance_date: new Date().toISOString().slice(0, 10),
    account_role,
  });
}

// ─── TRANSACTIONS ────────────────────────────────────────────
// Firefly III TX schema requires source/destination accounts.
// Convención van-life:
//   expense → source = asset account (cash/bank), destination = expense account
//   income  → source = revenue account, destination = asset account
async function createTransaction({
  type,                  // 'withdrawal' | 'deposit' | 'transfer'
  amount,                // number
  currency_code = 'NZD',
  description,
  date = null,
  category_name = null,
  source_name,           // e.g., 'ASB Checking'
  destination_name,      // e.g., 'Groceries' (expense), 'Salary' (income)
  notes = null,
  external_id = null,
  tags = null,
}) {
  return _request('POST', '/api/v1/transactions', {
    error_if_duplicate_hash: true,
    apply_rules: true,
    fire_webhooks: false,
    transactions: [{
      type,
      date: date || new Date().toISOString().slice(0, 10),
      amount: String(amount),
      currency_code,
      description: description || '(no description)',
      source_name,
      destination_name,
      category_name,
      notes,
      external_id,
      tags,
    }],
  });
}

async function listTransactions({ start, end, type, limit = 50, page = 1 } = {}) {
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  if (type) params.set('type', type);
  params.set('limit', String(limit));
  params.set('page', String(page));
  return _request('GET', `/api/v1/transactions?${params}`);
}

// ─── CATEGORIES ──────────────────────────────────────────────
async function listCategories() {
  return _request('GET', '/api/v1/categories');
}

async function createCategory(name, notes = null) {
  return _request('POST', '/api/v1/categories', { name, notes });
}

// ─── BUDGETS (we keep custom budgets in our DB; FF3 budgets are
//     a separate concept we don't migrate yet)
async function listBudgets() {
  return _request('GET', '/api/v1/budgets');
}

// ─── SUMMARY (net worth, income, expense aggregates) ─────────
async function getSummary({ start, end } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const params = new URLSearchParams({
    start: start || today.slice(0, 8) + '01',
    end: end || today,
  });
  return _request('GET', `/api/v1/summary/basic?${params}`);
}

module.exports = {
  isConfigured,
  getAbout,
  listAccounts, createAccount,
  createTransaction, listTransactions,
  listCategories, createCategory,
  listBudgets,
  getSummary,
};
