// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Akahu API integration (P3)               ║
// ║                                                            ║
// ║  STUB: requiere AKAHU_USER_TOKEN + AKAHU_APP_TOKEN en .env ║
// ║  Docs: https://developers.akahu.nz/docs                    ║
// ║                                                            ║
// ║  Akahu es el OpenBanking aggregator #1 NZ. Tier free      ║
// ║  permite read-only de balances + transactions de cuentas   ║
// ║  conectadas (ANZ/ASB/BNZ/Kiwibank/Westpac).                ║
// ║                                                            ║
// ║  Setup: usuario crea app en my.akahu.nz/developers,       ║
// ║  conecta sus cuentas reales, genera user_token + app_token.║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const AKAHU_API = 'https://api.akahu.io';

function isConfigured() {
  return !!(process.env.AKAHU_USER_TOKEN && process.env.AKAHU_APP_TOKEN);
}

async function _fetch(path) {
  const r = await fetch(`${AKAHU_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${process.env.AKAHU_USER_TOKEN}`,
      'X-Akahu-ID': process.env.AKAHU_APP_TOKEN,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Akahu HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function getAccounts() {
  if (!isConfigured()) return { skipped: 'AKAHU_USER_TOKEN/AKAHU_APP_TOKEN no configuradas' };
  return _fetch('/v1/accounts');
}

async function getTransactions({ start, end } = {}) {
  if (!isConfigured()) return { skipped: 'AKAHU_USER_TOKEN/AKAHU_APP_TOKEN no configuradas' };
  const params = new URLSearchParams();
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  return _fetch(`/v1/transactions${params.toString() ? '?' + params : ''}`);
}

/**
 * Importa transacciones recientes Akahu → finances. Dedup por imported_id.
 */
async function importRecent({ daysBack = 7 } = {}) {
  if (!isConfigured()) return { newCount: 0, skipped: true };
  const start = new Date(Date.now() - daysBack * 86400000).toISOString();
  const stmt = await getTransactions({ start });
  const txns = stmt.items || stmt.data || [];
  let newCount = 0;

  for (const t of txns) {
    const date = (t.date || '').split('T')[0];
    const amount = parseFloat(t.amount || 0);
    const desc = t.description || t.merchant?.name || '';
    const importedId = `akahu:${t._id || t.id}`;
    const account = `Akahu-${(t._account || t.account || 'unknown').slice(-8)}`;
    try {
      await db.query(
        `INSERT INTO finances (type, amount, currency, amount_nzd, account, source, imported_id, category, description, date)
         VALUES ($1, $2, 'NZD', $2, $3, 'akahu', $4, $5, $6, $7)
         ON CONFLICT (account, imported_id) WHERE imported_id IS NOT NULL DO NOTHING`,
        [
          amount >= 0 ? 'income' : 'expense',
          Math.abs(amount),
          account,
          importedId,
          t.category?.name || 'akahu_import',
          desc.substring(0, 500),
          date,
        ]
      );
      newCount++;
    } catch (err) {
      console.warn(`⚠️ Akahu import skip:`, err.message);
    }
  }
  console.log(`💳 [Akahu] ${newCount}/${txns.length} new transactions imported`);
  return { newCount, total: txns.length };
}

module.exports = {
  isConfigured,
  getAccounts,
  getTransactions,
  importRecent,
};
