// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — GoCardless Bank Account Data (ex-Nordigen) ║
// ║                                                            ║
// ║  Free aggregator: 31 países, 2,300+ bancos EU/UK           ║
// ║  Docs: https://developer.gocardless.com/bank-account-data/ ║
// ║                                                            ║
// ║  Setup:                                                    ║
// ║   1. https://bankaccountdata.gocardless.com/ register      ║
// ║   2. Crea Secret ID + Secret Key                           ║
// ║   3. Añade .env: GOCARDLESS_SECRET_ID, _SECRET_KEY          ║
// ║   4. Para link bancos individuales, llamar /requisitions   ║
// ║      → user redirect → callback → access_token persistido  ║
// ║                                                            ║
// ║  Esta versión maneja:                                      ║
// ║   • token bootstrap (refresh-aware)                         ║
// ║   • listInstitutions(country)                               ║
// ║   • createRequisition (link wizard)                         ║
// ║   • importTransactions(account_id) → finances dedup        ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const BASE = 'https://bankaccountdata.gocardless.com/api/v2';
let _token = null;
let _expires = 0;

function isConfigured() {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

async function getToken() {
  if (!isConfigured()) throw new Error('GOCARDLESS_SECRET_ID + _SECRET_KEY no configurados');
  if (_token && Date.now() < _expires - 60000) return _token;
  const r = await fetch(`${BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`GoCardless token HTTP ${r.status}`);
  const data = await r.json();
  _token = data.access;
  _expires = Date.now() + (data.access_expires || 86400) * 1000;
  return _token;
}

async function _api(path, opts = {}) {
  const token = await getToken();
  const r = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`GoCardless ${path} HTTP ${r.status}`);
  return r.json();
}

async function listInstitutions(country = 'ES') {
  if (!isConfigured()) return { configured: false };
  return _api(`/institutions/?country=${country}`);
}

// Returns redirect URL for the user to authenticate with their bank
async function createRequisition({ institutionId, redirect, reference }) {
  if (!isConfigured()) return { configured: false };
  const data = await _api(`/requisitions/`, {
    method: 'POST',
    body: JSON.stringify({
      institution_id: institutionId,
      redirect: redirect || `${process.env.BASE_URL || 'http://localhost:3000'}/webhooks/gocardless/callback`,
      reference: reference || `ref-${Date.now()}`,
      user_language: 'EN',
    }),
  });
  return data;
}

async function listAccounts(requisitionId) {
  if (!isConfigured()) return { configured: false };
  return _api(`/requisitions/${requisitionId}/`);
}

async function getTransactions(accountId) {
  if (!isConfigured()) return { configured: false };
  return _api(`/accounts/${accountId}/transactions/`);
}

// Imports recent transactions to finances table (dedup vía imported_id)
async function importRecent(accountId) {
  if (!isConfigured()) {
    return { configured: false, skipped: 'GOCARDLESS_SECRET_ID + _SECRET_KEY no configurados' };
  }
  try {
    const data = await getTransactions(accountId);
    const txs = data?.transactions?.booked || [];
    let inserted = 0, skipped = 0;
    for (const t of txs) {
      const imported_id = t.transactionId || t.internalTransactionId;
      const exists = await db.queryOne(
        `SELECT id FROM finances WHERE imported_id = $1 AND account = $2`,
        [imported_id, accountId]
      );
      if (exists) { skipped++; continue; }
      const amount = parseFloat(t.transactionAmount?.amount || 0);
      const currency = t.transactionAmount?.currency || 'EUR';
      const desc = t.remittanceInformationUnstructured || t.creditorName || t.debtorName || '';
      const date = t.bookingDate || t.valueDate || new Date().toISOString().slice(0, 10);
      await db.query(
        `INSERT INTO finances (description, amount, currency, type, category, date, account, source, imported_id)
         VALUES ($1, $2, $3, $4, 'gocardless', $5, $6, 'gocardless', $7)`,
        [desc.slice(0, 500), Math.abs(amount), currency, amount < 0 ? 'expense' : 'income', date, accountId, imported_id]
      );
      inserted++;
    }
    return { source: 'gocardless', accountId, fetched: txs.length, inserted, skipped };
  } catch (err) {
    return { source: 'gocardless', error: err.message };
  }
}

module.exports = {
  isConfigured,
  getToken,
  listInstitutions,
  createRequisition,
  listAccounts,
  getTransactions,
  importRecent,
};
