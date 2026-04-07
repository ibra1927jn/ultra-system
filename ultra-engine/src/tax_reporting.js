// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Tax reporting (P3 Fase 3b)               ║
// ║                                                            ║
// ║  Generadores para los modelos fiscales españoles que       ║
// ║  afectan a residentes con bienes en el extranjero:         ║
// ║                                                            ║
// ║  • Modelo 720 — Bienes y derechos en el extranjero         ║
// ║    Umbral: 50,000€ por categoría (cuentas, valores,        ║
// ║    inmuebles). Plazo: hasta 31 marzo del año siguiente.    ║
// ║                                                            ║
// ║  • Modelo 721 — Criptomonedas en exchanges extranjeros     ║
// ║    Umbral: 50,000€ valor en algún momento del año.         ║
// ║    Plazo: hasta 31 marzo del año siguiente.                ║
// ║    Vigente desde 2024 (info ejercicio 2023+).              ║
// ║                                                            ║
// ║  Output: estructura form-ready + flag de obligación.       ║
// ║  IMPORTANTE: NO presenta — solo prepara los datos.         ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const UMBRAL_720_EUR = 50000;
const UMBRAL_721_EUR = 50000;

/**
 * Convierte un monto de NZD a EUR usando fin_exchange_rates más reciente.
 */
async function nzdToEur(amountNzd) {
  if (!amountNzd) return 0;
  const r = await db.queryOne(
    `SELECT rate FROM fin_exchange_rates
     WHERE base='NZD' AND quote='EUR'
     ORDER BY date DESC LIMIT 1`
  );
  if (!r) return amountNzd * 0.5;  // fallback rough
  return parseFloat(amountNzd) * parseFloat(r.rate);
}

/**
 * Genera reporte Modelo 720 — bienes en el extranjero.
 *
 * Categorías:
 *   1. Cuentas en entidades financieras situadas en el extranjero
 *   2. Valores, derechos, seguros, rentas (acciones, fondos)
 *   3. Bienes inmuebles
 *
 * Lectura desde finances.account: agrupa por account, suma balances,
 * filtra los que NO son ES.
 */
async function generateModelo720({ year } = {}) {
  const targetYear = year || new Date().getFullYear() - 1;
  // Detectar accounts foreign (no contienen "ES" o "Spain")
  const accounts = await db.queryAll(
    `SELECT account,
            SUM(CASE WHEN type='income' THEN COALESCE(amount_nzd,amount) ELSE 0 END) -
            SUM(CASE WHEN type='expense' THEN COALESCE(amount_nzd,amount) ELSE 0 END) AS balance_nzd,
            COUNT(*) AS tx_count,
            MAX(date) AS last_tx
     FROM finances
     WHERE account IS NOT NULL
       AND date <= make_date($1, 12, 31)
     GROUP BY account
     HAVING SUM(CASE WHEN type='income' THEN COALESCE(amount_nzd,amount) ELSE 0 END) -
            SUM(CASE WHEN type='expense' THEN COALESCE(amount_nzd,amount) ELSE 0 END) > 0`,
    [targetYear]
  );

  // Heurística: foreign si account name no menciona "ES"/"Spain"/"euro"
  const categoria1 = []; // cuentas en el extranjero
  let totalCat1Eur = 0;
  for (const a of accounts) {
    const name = (a.account || '').toLowerCase();
    const isForeign = !/es$|spain|sabadell|santander|bbva|caixabank|openbank|euro/.test(name);
    if (!isForeign) continue;
    const balanceEur = await nzdToEur(parseFloat(a.balance_nzd));
    const item = {
      account: a.account,
      balance_nzd: parseFloat(a.balance_nzd),
      balance_eur: Number(balanceEur.toFixed(2)),
      tx_count: parseInt(a.tx_count, 10),
      last_tx: a.last_tx,
    };
    categoria1.push(item);
    totalCat1Eur += balanceEur;
  }

  return {
    year: targetYear,
    deadline: `${targetYear + 1}-03-31`,
    threshold_eur: UMBRAL_720_EUR,
    obligated: totalCat1Eur > UMBRAL_720_EUR,
    categoria_1_cuentas_extranjero: {
      total_eur: Number(totalCat1Eur.toFixed(2)),
      items: categoria1,
    },
    categoria_2_valores_seguros: { total_eur: 0, items: [] },  // No tracking yet
    categoria_3_inmuebles: { total_eur: 0, items: [] },        // No tracking yet
    notes: [
      'Solo se ha rellenado categoría 1 (cuentas) leyendo finances.account.',
      'Categorías 2 (valores) y 3 (inmuebles) requieren input manual.',
      'Heurística foreign: account NO contiene ES/Spain/Sabadell/Santander/BBVA/CaixaBank/Openbank/euro.',
      'Conversión NZD→EUR via fin_exchange_rates más reciente.',
      'IMPORTANTE: solo prepara datos. Presenta el modelo en sede.agenciatributaria.gob.es',
    ],
  };
}

/**
 * Genera reporte Modelo 721 — Criptomonedas en exchanges extranjeros.
 * Umbral: 50,000€ en cualquier momento del año.
 *
 * Lectura: fin_crypto_holdings + max-value approximation.
 */
async function generateModelo721({ year } = {}) {
  const targetYear = year || new Date().getFullYear() - 1;
  const holdings = await db.queryAll(
    `SELECT id, symbol, amount, exchange, wallet_address, notes
     FROM fin_crypto_holdings
     WHERE is_active = TRUE`
  );

  // Use last cached prices in NZD then convert to EUR
  const symbols = [...new Set(holdings.map(h => h.symbol))];
  const prices = {};
  for (const sym of symbols) {
    const r = await db.queryOne(
      `SELECT rate FROM fin_exchange_rates
       WHERE base = $1 AND quote='NZD' AND source='coingecko'
       ORDER BY date DESC LIMIT 1`,
      [sym]
    );
    prices[sym] = r ? parseFloat(r.rate) : 0;
  }

  const items = [];
  let totalEur = 0;
  // Solo exchanges foreign — Spain solo Bit2Me, Bitnovo. Resto foreign.
  const SPANISH_EXCHANGES = new Set(['bit2me', 'bitnovo']);
  for (const h of holdings) {
    const isSpanish = SPANISH_EXCHANGES.has((h.exchange || '').toLowerCase());
    if (isSpanish) continue;
    const priceNzd = prices[h.symbol] || 0;
    const valueNzd = parseFloat(h.amount) * priceNzd;
    const valueEur = await nzdToEur(valueNzd);
    items.push({
      symbol: h.symbol,
      amount: parseFloat(h.amount),
      exchange: h.exchange,
      price_nzd: priceNzd,
      value_nzd: Number(valueNzd.toFixed(2)),
      value_eur: Number(valueEur.toFixed(2)),
      wallet_address: h.wallet_address,
    });
    totalEur += valueEur;
  }

  return {
    year: targetYear,
    deadline: `${targetYear + 1}-03-31`,
    threshold_eur: UMBRAL_721_EUR,
    obligated: totalEur > UMBRAL_721_EUR,
    total_eur: Number(totalEur.toFixed(2)),
    items,
    notes: [
      'Modelo 721 vigente desde 2024 (DAC8 implementación parcial ES).',
      'Umbral 50K€ en CUALQUIER MOMENTO del año (no solo a 31-dic). Esto requiere histórico de precios — actualmente uso precio actual como aproximación.',
      'Filtra automáticamente exchanges españoles (Bit2Me, Bitnovo) que ya reportan a AEAT.',
      'Wallets self-custody (cold) NO van en 721 — solo en exchanges.',
      'IMPORTANTE: solo prepara datos. Presenta en sede.agenciatributaria.gob.es',
    ],
  };
}

module.exports = { generateModelo720, generateModelo721, UMBRAL_720_EUR, UMBRAL_721_EUR };
