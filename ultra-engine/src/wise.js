// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Wise API integration (P3)                ║
// ║                                                          ║
// ║  STUB: requiere WISE_API_TOKEN (read-only) en .env       ║
// ║  Docs: https://docs.wise.com/api-docs                    ║
// ║                                                          ║
// ║  Read-only token NO necesita SCA — perfecto para fetch   ║
// ║  de balances y transacciones. Full token (transferencias)║
// ║  requiere SCA + private key signing y queda fuera scope. ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const WISE_API = 'https://api.wise.com';

function isConfigured() {
  return !!process.env.WISE_API_TOKEN;
}

async function _fetch(path) {
  const res = await fetch(`${WISE_API}${path}`, {
    headers: {
      'Authorization': `Bearer ${process.env.WISE_API_TOKEN}`,
      'Accept': 'application/json',
      'User-Agent': 'UltraSystem/1.0',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Wise HTTP ${res.status}: ${await res.text().catch(() => '')}`);
  }
  return res.json();
}

/**
 * Lista profiles del usuario (personal + business).
 * Endpoint: GET /v2/profiles
 */
async function getProfiles() {
  if (!isConfigured()) return { skipped: 'WISE_API_TOKEN no configurada' };
  return await _fetch('/v2/profiles');
}

/**
 * Lista balances de un profile (multi-currency).
 * Endpoint: GET /v4/profiles/{id}/balances?types=STANDARD
 */
async function getBalances(profileId) {
  if (!isConfigured()) return { skipped: 'WISE_API_TOKEN no configurada' };
  return await _fetch(`/v4/profiles/${profileId}/balances?types=STANDARD`);
}

/**
 * Statement de transacciones de un balance específico.
 * Endpoint: GET /v3/profiles/{p}/borderless-accounts/{a}/statement.json
 *   ?currency=NZD&intervalStart=...&intervalEnd=...&type=COMPACT
 */
async function getStatement(profileId, accountId, currency, daysBack = 30) {
  if (!isConfigured()) return { skipped: 'WISE_API_TOKEN no configurada' };
  const end = new Date().toISOString();
  const start = new Date(Date.now() - daysBack * 86400 * 1000).toISOString();
  const path = `/v3/profiles/${profileId}/borderless-accounts/${accountId}/statement.json`
    + `?currency=${currency}&intervalStart=${start}&intervalEnd=${end}&type=COMPACT`;
  return await _fetch(path);
}

/**
 * Importa transacciones recientes Wise → tabla finances con dedup por imported_id.
 * Llamada a este desde el scheduler cuando WISE_API_TOKEN exista.
 */
async function importRecent(profileId, accountId, currency, daysBack = 7) {
  if (!isConfigured()) return { newCount: 0, skipped: true };

  const stmt = await getStatement(profileId, accountId, currency, daysBack);
  const txns = stmt.transactions || [];
  let newCount = 0;

  for (const t of txns) {
    const date = (t.date || '').split('T')[0];
    const amount = parseFloat(t.amount?.value || 0);
    const desc = t.details?.description || t.referenceNumber || '';
    const importedId = `wise:${t.referenceNumber || t.id || `${date}-${amount}-${desc.substring(0, 20)}`}`;

    try {
      await db.query(
        `INSERT INTO finances (type, amount, currency, amount_nzd, account, source, imported_id, category, description, date)
         VALUES ($1, $2, $3, NULL, $4, 'wise', $5, 'wise_import', $6, $7)
         ON CONFLICT (account, imported_id) WHERE imported_id IS NOT NULL DO NOTHING`,
        [
          amount >= 0 ? 'income' : 'expense',
          Math.abs(amount),
          currency,
          `Wise-${currency}`,
          importedId,
          desc.substring(0, 500),
          date,
        ]
      );
      newCount++;
    } catch (err) {
      console.warn(`⚠️ Wise import skip:`, err.message);
    }
  }
  console.log(`💱 [Wise] ${newCount}/${txns.length} new transactions imported`);
  return { newCount, total: txns.length };
}

module.exports = {
  isConfigured,
  getProfiles,
  getBalances,
  getStatement,
  importRecent,
};
