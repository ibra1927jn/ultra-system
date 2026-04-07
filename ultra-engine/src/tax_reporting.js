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

/**
 * Modelo 100 — Declaración del IRPF (España)
 *
 * Solo aplica si user es residente fiscal ES (>183 días/año en ES).
 * Computa ingresos anuales agrupados por tipo (rendimientos del trabajo,
 * actividades económicas, capital, alquileres, ganancias patrimoniales).
 *
 * IMPORTANTE: solo prepara datos. Presentación en Renta WEB Hacienda.
 */
async function generateModelo100({ year } = {}) {
  const targetYear = year || new Date().getFullYear() - 1;

  // Suma ingresos por categoría (mapping heurístico desde category de finances)
  const incomes = await db.queryAll(
    `SELECT category, SUM(COALESCE(amount_nzd, amount)) AS total_nzd, COUNT(*) AS tx_count
     FROM finances
     WHERE type = 'income'
       AND date >= make_date($1, 1, 1)
       AND date <= make_date($1, 12, 31)
     GROUP BY category
     ORDER BY total_nzd DESC`,
    [targetYear]
  );

  // Mapping category → IRPF section heuristics
  const sections = {
    rendimientos_trabajo: 0,        // Salaries, employment
    actividades_economicas: 0,       // Self-employed
    capital_mobiliario: 0,           // Dividends, interest
    capital_inmobiliario: 0,         // Rentals
    ganancias_patrimoniales: 0,      // Capital gains crypto/stocks
    otros: 0,
  };
  const breakdown = [];

  for (const inc of incomes) {
    const cat = (inc.category || '').toLowerCase();
    const totalNzd = parseFloat(inc.total_nzd);
    const totalEur = await nzdToEur(totalNzd);
    let section = 'otros';
    if (/salary|salario|wage|sueldo|payroll|paye/.test(cat)) section = 'rendimientos_trabajo';
    else if (/freelance|consulting|invoice|cliente|self.?employed|autonomo/.test(cat)) section = 'actividades_economicas';
    else if (/dividend|interest|interés/.test(cat)) section = 'capital_mobiliario';
    else if (/rental|alquiler|airbnb/.test(cat)) section = 'capital_inmobiliario';
    else if (/crypto|stocks|trading|capital_gain/.test(cat)) section = 'ganancias_patrimoniales';
    sections[section] += totalEur;
    breakdown.push({
      category: inc.category, section,
      total_nzd: Number(totalNzd.toFixed(2)),
      total_eur: Number(totalEur.toFixed(2)),
      tx_count: parseInt(inc.tx_count, 10),
    });
  }

  const totalEur = Object.values(sections).reduce((a, b) => a + b, 0);

  return {
    year: targetYear,
    deadline: `${targetYear + 1}-06-30`,
    sections: Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, Number(v.toFixed(2))])
    ),
    total_eur: Number(totalEur.toFixed(2)),
    breakdown,
    notes: [
      'Solo aplica si eres residente fiscal ES (>183 días/año en territorio español).',
      'Use /api/finances/tax/residency-es para verificar status de residencia.',
      'Categorización heurística: revisar manualmente antes de presentar.',
      'NO incluye deducciones, mínimo personal/familiar, ni bonificaciones autonómicas.',
      'Presentación oficial via Renta WEB en sede.agenciatributaria.gob.es',
    ],
  };
}

/**
 * Spanish residency day counter — más de 183 días en territorio ES en año natural
 * = residente fiscal con obligación de tributar por renta mundial.
 *
 * Lee bur_travel_log: días en ES = días en país - días fuera.
 * Si user no logging activo, devuelve null.
 */
async function computeResidencyES({ year } = {}) {
  const targetYear = year || new Date().getFullYear();
  const yearStart = `${targetYear}-01-01`;
  const yearEnd = `${targetYear}-12-31`;
  const today = new Date().toISOString().split('T')[0];
  const effectiveEnd = new Date(yearEnd) > new Date(today) ? today : yearEnd;

  // Sum días fuera de ES en el año
  const outsideES = await db.queryAll(
    `SELECT country, entry_date, COALESCE(exit_date, $1::date) AS exit_date,
            (LEAST(COALESCE(exit_date, $1::date), $2::date) - GREATEST(entry_date, $3::date)) + 1 AS days_in_year
     FROM bur_travel_log
     WHERE country != 'ES'
       AND entry_date <= $2::date
       AND COALESCE(exit_date, $1::date) >= $3::date
     ORDER BY entry_date`,
    [today, effectiveEnd, yearStart]
  );

  const daysOutside = outsideES.reduce((sum, t) => sum + Math.max(0, parseInt(t.days_in_year, 10)), 0);
  const totalDaysInYear = Math.round((new Date(effectiveEnd) - new Date(yearStart)) / 86400000) + 1;
  const daysInES = Math.max(0, totalDaysInYear - daysOutside);

  return {
    year: targetYear,
    period_start: yearStart,
    period_end: effectiveEnd,
    total_days: totalDaysInYear,
    days_outside_es: daysOutside,
    days_in_es: daysInES,
    threshold_days: 183,
    is_resident: daysInES > 183,
    days_to_residency: Math.max(0, 184 - daysInES),
    breakdown: outsideES.map(t => ({
      country: t.country,
      entry: t.entry_date,
      exit: t.exit_date,
      days_in_year: parseInt(t.days_in_year, 10),
    })),
    notes: [
      'Computado desde bur_travel_log. Solo cuenta trips registrados.',
      'Si is_resident=true: residente fiscal ES, debe presentar Modelo 100 (IRPF) + 720 si bienes >50K€ extranjero + 721 si crypto >50K€.',
      'IMPORTANTE: regla 183 días es CRITERIO PRINCIPAL. Otros criterios: centro de intereses económicos en ES, presunción si cónyuge+menores residen ES.',
      'Días fuera por causas excepcionales (estancia médica, etc.) pueden no contar — consultar asesor fiscal.',
    ],
  };
}

/**
 * NZ PAYE estimator — 2025/26 income tax thresholds.
 *
 * Tax year: 1 April → 31 March.
 * Brackets (NZD annual income):
 *  - 10.5%  on first $14,000
 *  - 17.5%  $14,001 – $48,000
 *  - 30%    $48,001 – $70,000
 *  - 33%    $70,001 – $180,000
 *  - 39%    $180,001+
 * ACC earner levy: 1.6% on income up to $142,283 (2024/25 cap)
 *
 * Returns: { gross, tax_payable, acc_levy, net, effective_rate, marginal_rate, brackets_breakdown }
 */
function paymentBracket(income) {
  // Returns array of { bracket, taxed_in_bracket, amount, rate, tax }
  const brackets = [
    { from: 0, to: 14000, rate: 0.105 },
    { from: 14000, to: 48000, rate: 0.175 },
    { from: 48000, to: 70000, rate: 0.30 },
    { from: 70000, to: 180000, rate: 0.33 },
    { from: 180000, to: Infinity, rate: 0.39 },
  ];
  let totalTax = 0;
  const breakdown = [];
  for (const b of brackets) {
    if (income <= b.from) break;
    const inThis = Math.min(income, b.to) - b.from;
    const tax = inThis * b.rate;
    totalTax += tax;
    breakdown.push({
      from: b.from, to: b.to === Infinity ? null : b.to,
      rate: b.rate * 100, taxed_in_bracket: inThis, tax_in_bracket: Number(tax.toFixed(2)),
    });
  }
  return { totalTax, breakdown };
}

function computePayeNZ({ annual_income_nzd } = {}) {
  const income = parseFloat(annual_income_nzd) || 0;
  if (income <= 0) {
    return { error: 'annual_income_nzd must be > 0' };
  }
  const { totalTax, breakdown } = paymentBracket(income);
  // ACC levy: 1.6% on income up to ~$142,283
  const accCap = 142283;
  const accLevy = Math.min(income, accCap) * 0.016;

  // Marginal rate: rate of last bracket touched
  const lastBracket = breakdown[breakdown.length - 1];
  const marginalRate = lastBracket ? lastBracket.rate : 10.5;

  const net = income - totalTax - accLevy;
  return {
    gross_nzd: Number(income.toFixed(2)),
    tax_payable_nzd: Number(totalTax.toFixed(2)),
    acc_earner_levy_nzd: Number(accLevy.toFixed(2)),
    net_nzd: Number(net.toFixed(2)),
    effective_rate_pct: Number(((totalTax + accLevy) / income * 100).toFixed(2)),
    marginal_rate_pct: marginalRate,
    brackets: breakdown,
    notes: [
      'NZ tax year: 1 April → 31 March.',
      '2024/25 brackets (verify current at ird.govt.nz).',
      'ACC levy capped at $142,283 income (2024/25).',
      'NO KiwiSaver, student loan, child support, or other deductions included.',
      'For employed (PAYE): employer withholds. For self-employed: provisional tax + GST separate.',
    ],
  };
}

// ════════════════════════════════════════════════════════════
//  FIF NZ — Foreign Investment Fund tax (R4 Tier A 2026-04-07)
//  Inversiones offshore >NZD 50K cost: aplica FDR (Fair Dividend Rate)
//  por defecto = 5% del valor de mercado al inicio del año fiscal NZ.
//  Año fiscal NZ: 1 abril → 31 marzo.
//
//  Métodos disponibles (simplificados, hardcoded core rules):
//   - FDR (default): 5% del valor de mercado al 1-Apr
//   - CV (Comparative Value): no implementado, requiere precios apertura+cierre
//   - Cost: para activos no cotizados (5% del coste)
//
//  De minimis: si total cost de offshore < NZD 50,000 → exento (puede usar
//  método actual basis, dividendos directos).
// ════════════════════════════════════════════════════════════
const FIF_DE_MINIMIS_NZD = 50000;
const FIF_DEFAULT_RATE = 0.05;

/**
 * computeFIF_NZ({ positions, marginalRate })
 *   positions: [{ symbol, market_value_nzd, cost_nzd, dividends_nzd? }]
 *   marginalRate: 0.105 / 0.175 / 0.30 / 0.33 / 0.39 (NZ PAYE bracket)
 * Devuelve { exempt, total_cost_nzd, total_market_value_nzd,
 *            method, fif_income_nzd, tax_payable_nzd }
 */
function computeFIF_NZ({ positions = [], marginalRate = 0.33 } = {}) {
  if (!Array.isArray(positions)) {
    return { error: 'positions must be an array of {symbol, market_value_nzd, cost_nzd}' };
  }
  const totalCost = positions.reduce((s, p) => s + (parseFloat(p.cost_nzd) || 0), 0);
  const totalMV = positions.reduce((s, p) => s + (parseFloat(p.market_value_nzd) || 0), 0);

  if (totalCost < FIF_DE_MINIMIS_NZD) {
    const dividends = positions.reduce((s, p) => s + (parseFloat(p.dividends_nzd) || 0), 0);
    return {
      exempt: true,
      reason: `total cost NZD ${totalCost.toFixed(2)} < de minimis ${FIF_DE_MINIMIS_NZD}`,
      total_cost_nzd: Number(totalCost.toFixed(2)),
      total_market_value_nzd: Number(totalMV.toFixed(2)),
      method: 'actual_dividends',
      fif_income_nzd: Number(dividends.toFixed(2)),
      tax_payable_nzd: Number((dividends * marginalRate).toFixed(2)),
      marginal_rate: marginalRate,
    };
  }

  // FDR: 5% × market value at start of year
  const fdrIncome = totalMV * FIF_DEFAULT_RATE;
  const taxFDR = fdrIncome * marginalRate;

  return {
    exempt: false,
    total_cost_nzd: Number(totalCost.toFixed(2)),
    total_market_value_nzd: Number(totalMV.toFixed(2)),
    method: 'FDR',
    fdr_rate: FIF_DEFAULT_RATE,
    fif_income_nzd: Number(fdrIncome.toFixed(2)),
    tax_payable_nzd: Number(taxFDR.toFixed(2)),
    marginal_rate: marginalRate,
    notes: [
      'FDR is the default method. CV (Comparative Value) may yield lower tax in down years — not implemented.',
      'Quick FIF rules only — no fair value adjustments, quick sale gain rules, or peak holding tests.',
      'For offical filing, consult a NZ tax advisor or use Inland Revenue IR461 worksheet.',
    ],
  };
}

// ════════════════════════════════════════════════════════════
//  Régimen Beckham (España) — inpat regime estimator
//  Ley 35/2006 art. 93 + RD 439/2007: trabajadores desplazados a España
//  pueden optar por tributar como no-residentes durante 6 años:
//   - Tipo fijo 24% sobre primeros 600.000€ rendimientos del trabajo
//   - 47% sobre exceso por encima de 600.000€
//   - Solo tributan rentas de fuente española (NO patrimonio mundial,
//     NO modelo 720, NO IRPF progresivo)
//  Requisitos: no haber sido residente fiscal ES en últimos 5 años,
//  desplazamiento por contrato laboral, comunicación a Hacienda en 6m.
// ════════════════════════════════════════════════════════════
const BECKHAM_THRESHOLD_EUR = 600000;
const BECKHAM_LOW_RATE = 0.24;
const BECKHAM_HIGH_RATE = 0.47;

/**
 * computeBeckham({ gross_income_eur }) → comparativa Beckham vs IRPF estándar.
 * IRPF estatal+autonómico simplificado a brackets ESTATAL 2024 (sin variación CCAA).
 */
function computeBeckham({ gross_income_eur } = {}) {
  if (!gross_income_eur || gross_income_eur <= 0) {
    return { error: 'gross_income_eur required and > 0' };
  }
  const gross = parseFloat(gross_income_eur);

  // Beckham
  const lowPart = Math.min(gross, BECKHAM_THRESHOLD_EUR);
  const highPart = Math.max(0, gross - BECKHAM_THRESHOLD_EUR);
  const beckhamTax = lowPart * BECKHAM_LOW_RATE + highPart * BECKHAM_HIGH_RATE;
  const beckhamEffective = (beckhamTax / gross) * 100;

  // IRPF estándar simplificado (estatal + autonómico aproximado, brackets 2024 unificados)
  // 0-12450 19%, 12450-20200 24%, 20200-35200 30%, 35200-60000 37%, 60000-300000 45%, >300000 47%
  const brackets = [
    { upper: 12450, rate: 0.19 },
    { upper: 20200, rate: 0.24 },
    { upper: 35200, rate: 0.30 },
    { upper: 60000, rate: 0.37 },
    { upper: 300000, rate: 0.45 },
    { upper: Infinity, rate: 0.47 },
  ];
  let irpfTax = 0;
  let prev = 0;
  for (const b of brackets) {
    if (gross > prev) {
      const taxable = Math.min(gross, b.upper) - prev;
      irpfTax += taxable * b.rate;
      prev = b.upper;
    }
  }
  const irpfEffective = (irpfTax / gross) * 100;

  const savings = irpfTax - beckhamTax;

  return {
    gross_income_eur: gross,
    beckham: {
      tax_eur: Number(beckhamTax.toFixed(2)),
      effective_rate_pct: Number(beckhamEffective.toFixed(2)),
      net_eur: Number((gross - beckhamTax).toFixed(2)),
      threshold_breakdown: {
        below_600k_at_24pct: Number((lowPart * BECKHAM_LOW_RATE).toFixed(2)),
        above_600k_at_47pct: Number((highPart * BECKHAM_HIGH_RATE).toFixed(2)),
      },
    },
    irpf_standard: {
      tax_eur: Number(irpfTax.toFixed(2)),
      effective_rate_pct: Number(irpfEffective.toFixed(2)),
      net_eur: Number((gross - irpfTax).toFixed(2)),
    },
    savings_with_beckham_eur: Number(savings.toFixed(2)),
    beckham_better: savings > 0,
    notes: [
      'Estimación simplificada — no contempla deducciones, mínimo personal/familiar, reducciones por rendimientos del trabajo.',
      'IRPF brackets son ESTATAL+AUTONÓMICO aproximados 2024. Variación real por CCAA ±2-4%.',
      'Beckham requiere comunicación a AEAT en 6 meses desde alta SS. Validez máx 6 años.',
      'Beckham NO declara modelo 720 ni patrimonio mundial. Sólo rentas fuente española.',
    ],
  };
}

module.exports = {
  generateModelo720, generateModelo721, generateModelo100, computeResidencyES, computePayeNZ,
  computeFIF_NZ, computeBeckham,
  UMBRAL_720_EUR, UMBRAL_721_EUR, FIF_DE_MINIMIS_NZD, BECKHAM_THRESHOLD_EUR,
};
