# Finance Pillar Architecture Design — Ultra System v2

> Documento de diseno generado 2026-04-06 | Branch: v2-rebuild
> Basado en investigacion de Firefly III, Actual Budget, Maybe Finance, Ghostfolio,
> bancos NZ, Wise API, CCXT, APIs de moneda, y algoritmos de finanzas personales
> Monedas: NZD (principal), EUR, USD, AUD

---

## 1. Fuentes de Datos

### 1.1 CSV Bancario (Fuente Principal — Fase 1)

Importacion manual de CSV descargado del banco. Los 5 bancos principales de NZ:

| Banco | Columnas CSV | Formato Fecha | Balance | Notas |
|-------|-------------|---------------|---------|-------|
| **ASB** | Date, Unique Id, Tran Type, Cheque Number, Payee, Memo, Amount | `YYYY/MM/DD` | No | Amount unico (neg=debito) |
| **ANZ** | Type, Details, Particulars, Code, Reference, Amount, Date, ForeignCurrencyAmount, ConversionCharge | `DD/MM/YYYY` | No | Separa Particulars/Code/Reference (convencion NZ) |
| **Westpac** | Date, Amount, Other Party, Description, Reference, Particulars, Analysis Code | `DD/MM/YYYY` | No | "Analysis Code" = categoria del banco |
| **BNZ** | Date, Amount, Payee, Particulars, Code, Reference, Tran Type, This Party Account | `DD/MM/YYYY` | No | "This Party Account" util para multi-cuenta |
| **Kiwibank** | Account number, Date, Memo/Description, Source Code (Debit), Source Code (Credit), Amount, Balance | `DD-MM-YYYY` | **SI** | Unico banco NZ con balance en CSV |

**Implementacion:**
```javascript
// Bank profiles para parseo automatico
const BANK_PROFILES = {
  'asb': {
    dateColumn: 'Date', dateFormat: 'YYYY/MM/DD',
    amountColumn: 'Amount', payeeColumn: 'Payee',
    descriptionColumn: 'Memo', signFlip: false,
  },
  'anz': {
    dateColumn: 'Date', dateFormat: 'DD/MM/YYYY',
    amountColumn: 'Amount', payeeColumn: 'Details',
    descriptionColumn: ['Particulars', 'Code', 'Reference'], // concatenar
    signFlip: false,
  },
  'westpac': {
    dateColumn: 'Date', dateFormat: 'DD/MM/YYYY',
    amountColumn: 'Amount', payeeColumn: 'Other Party',
    descriptionColumn: 'Description', signFlip: false,
  },
  'bnz': {
    dateColumn: 'Date', dateFormat: 'DD/MM/YYYY',
    amountColumn: 'Amount', payeeColumn: 'Payee',
    descriptionColumn: ['Particulars', 'Code', 'Reference'], signFlip: false,
  },
  'kiwibank': {
    dateColumn: 'Date', dateFormat: 'DD-MM-YYYY',
    amountColumn: 'Amount', payeeColumn: 'Memo/Description',
    descriptionColumn: 'Memo/Description', signFlip: false,
    hasBalance: true, balanceColumn: 'Balance',
  },
};
```

**Libreria:** `csv-parse` (npm) para parsing + `dayjs` para fechas multi-formato.

**Dedup en import:** Primero buscar `imported_id` (Unique Id de ASB, o hash de date+amount+payee para otros). Si no existe, fuzzy match por date+amount+payee. Inspirado en Actual Budget.

### 1.2 Akahu API (Fuente Automatizada — Fase 2)

**Akahu** (akahu.nz) es el unico agregador bancario de NZ accesible para desarrolladores individuales.

- Conecta a: ASB, ANZ, Westpac, BNZ, Kiwibank y otros
- API unificada: `/accounts`, `/transactions`, `/transfers`
- Auth: OAuth 2.0 (usuario autoriza acceso)
- **Free tier para uso personal/hobby** — suficiente para un dashboard
- Devuelve transacciones normalizadas cross-banco
- Incluye categorizacion basica

**Decision:** Fase 2. Para Fase 1, CSV import es suficiente y no requiere dependencia externa.

### 1.3 Wise API (Multi-moneda)

Wise tiene API publica para cuentas personales. Ideal para NZD/EUR/USD/AUD.

- **Auth:** Token personal (read-only) generado en Settings > API tokens
- **Gratis** para lectura de datos
- **Endpoints clave:**
  - `GET /v4/profiles/{id}/balances` — Saldos por moneda
  - `GET /v3/profiles/{id}/borderless-accounts/{id}/statement.json` — Transacciones
  - `GET /v1/rates?source=NZD&target=USD` — Tasas de cambio (mid-market)
- **Sin SCA requerido** para token read-only
- Sandbox disponible para testing

**Decision:** Integrar en Fase 1. Es la fuente principal de datos multi-moneda y da tasas de cambio gratis.

### 1.4 Crypto via CCXT (CT4 Integration)

CCXT ya esta instalado en CT4 (crypto bot). Reutilizar para portfolio tracking.

- **Node.js:** `npm install ccxt`
- **`exchange.fetchBalance()`** — saldo por exchange
- **`exchange.fetchTicker('BTC/NZD')`** — precio actual
- Soporta 100+ exchanges (Binance, Kraken, Independent Reserve NZ)
- Auth via API keys del exchange (read-only)

**Para precios en NZD:** CoinGecko API (free, 10k calls/mes, soporta `vs_currencies=nzd`)

**Decision:** Fase 2. Priorizar fiat primero.

### 1.5 Input Manual (Siempre disponible)

Para gastos en efectivo, transferencias informales, ajustes. Ya funciona en v1 via `POST /api/finances`.

### 1.6 Resumen de Fuentes

| Fuente | Fase | Monedas | Frecuencia | Auth |
|--------|------|---------|------------|------|
| CSV banco NZ | 1 | NZD | Manual (mensual) | Ninguna |
| Wise API | 1 | NZD, EUR, USD, AUD | Auto (diario) | Token personal |
| Input manual | 1 | Cualquiera | On-demand | JWT (ya existe) |
| Akahu API | 2 | NZD | Auto (diario) | OAuth 2.0 |
| CCXT exchanges | 2 | BTC, ETH, etc. | Auto (cada 4h) | API keys exchange |
| CoinGecko API | 2 | Precios en NZD | Auto (cada 4h) | Free, sin auth |

---

## 2. Ideas Copiadas de Proyectos Open Source

### De Firefly III (PHP, 20k+ stars)

1. **Sistema de tipos de cuenta:** Asset (banco, ahorro), Expense (destino de gasto), Revenue (fuente de ingreso), Liability (deuda). El tipo de transaccion se infiere del par de cuentas: Asset→Expense = Withdrawal, Revenue→Asset = Deposit, Asset→Asset = Transfer.

2. **Multi-moneda con foreign_amount:** Cada transaccion almacena `amount` + `currency_id` y opcionalmente `foreign_amount` + `foreign_currency_id`. Para reportes, convertir todo a moneda base. El usuario puede override la conversion automatica.

3. **Rules engine para auto-categorizacion:** Tabla `rules` con conditions (campo, operador, valor) y actions (set_category, set_tag, etc.). Se ejecutan en orden de prioridad en cada import. Soporta ALL/ANY para condiciones.

4. **Piggy banks (metas de ahorro):** Sub-cuentas virtuales dentro de una cuenta real. Ejemplo: "Fondo de emergencia" = $2000 dentro de tu cuenta de ahorro. No mueves dinero real, solo lo "etiquetas".

5. **Subscriptions (gastos recurrentes):** Registrar gastos esperados con rango de monto (min/max) y frecuencia. El sistema marca cuando se cumple y alerta si no aparece. Se vincula a una rule para auto-match.

6. **account_meta key-value:** Evita migraciones cuando necesitas nuevas propiedades en cuentas. Tabla `account_meta(account_id, key, value)`.

### De Actual Budget (Node.js, 16k+ stars)

7. **Integer currency (centavos):** Almacenar $120.30 como `12030`. Evita errores de punto flotante. Todas las operaciones son enteras.

8. **Learn-from-behavior categorization:** Cuando el usuario categoriza "Countdown" como "Groceries" 3 veces, auto-crear una rule. Tabla `payee_category_defaults(payee, category_id, count)`.

9. **Import con dedup inteligente:** Primero verificar `imported_id` (ID unico del banco). Si no hay match, fuzzy match por date+amount+payee. Nunca duplicar.

10. **Pre/Default/Post rule stages:** Pre = limpiar/renombrar payee. Default = categorizar. Post = override. Evita conflictos entre rules.

11. **Envelope budgeting con carryover:** `available_next_month = budgeted - spent`. Si gastas de mas, se descuenta del proximo mes.

12. **Currency multiplier en CSV import:** Convertir moneda al importar (ej: CSV de Wise en USD, multiplicar por 1.65 para NZD aprox). UX simple.

### De Maybe Finance (Ruby, open-sourced)

13. **Net worth snapshots diarios:** Tabla `net_worth_snapshots(date, total_assets, total_liabilities, net_worth)`. Calcular cada noche, graficar historico.

14. **Cache invalidation con sync timestamps:** Cache keys incluyen timestamp del ultimo cambio. Auto-invalidar cuando hay datos nuevos.

### De Ghostfolio (NestJS + PostgreSQL)

15. **Performance time ranges estandar:** Today, WTD (week-to-date), MTD, YTD, 1Y, 5Y, Max. Aplicar a todos los graficos.

16. **Risk assessment multi-dimension:** Riesgo cambiario, riesgo de mercado, adecuacion de fondo de emergencia.

### De Lunch Money (SaaS)

17. **Deteccion automatica de gastos recurrentes:** Pattern matching sobre payee + amount_range + frequency. Sugerir al usuario, no asumir.

18. **Rules + notificaciones:** "Alertarme cuando una transaccion > $500 aparezca en categoria X". Telegram alert.

---

## 3. Flujo de Datos

```
           FUENTES
    ┌────────┬──────────┬──────────┬──────────┐
    │        │          │          │          │
  CSV      Wise API   Manual    Akahu(F2)  CCXT(F2)
  Import   (auto)     Input    (auto)      (auto)
    │        │          │          │          │
    └───┬────┴──────────┴────┬─────┴──────────┘
        │                    │
   ┌────▼────────────────────▼────┐
   │      IMPORT / INGEST LAYER   │
   │                              │
   │  1. Parse (CSV/JSON/API)     │
   │  2. Normalize to schema      │
   │     unificado                │
   │  3. Dedup (imported_id →     │
   │     fuzzy match)             │
   │  4. Currency: store native   │
   │     + convert to NZD         │
   └──────────────┬───────────────┘
                  │
   ┌──────────────▼───────────────┐
   │      PROCESSING LAYER        │
   │                              │
   │  1. Run rules engine         │
   │     (Pre → Default → Post)   │
   │  2. Auto-categorize          │
   │     (rules + payee defaults) │
   │  3. Detect recurring         │
   │     (interval analysis)      │
   │  4. Update balances          │
   │  5. Check budget alerts      │
   │  6. Calculate KPIs           │
   └──────────────┬───────────────┘
                  │
   ┌──────────────▼───────────────┐
   │      STORAGE (PostgreSQL)    │
   │                              │
   │  fin_accounts                │
   │  fin_transactions            │
   │  fin_categories              │
   │  fin_budgets                 │
   │  fin_rules                   │
   │  fin_recurring               │
   │  fin_exchange_rates          │
   │  fin_net_worth_snapshots     │
   │  fin_savings_goals           │
   └──────────────┬───────────────┘
                  │
   ┌──────────────▼───────────────┐
   │      API LAYER (Express.js)  │
   │                              │
   │  /api/v2/finance/*           │
   └──────────────┬───────────────┘
                  │
   ┌──────────────▼───────────────┐
   │      FRONTEND                │
   │                              │
   │  Dashboard KPIs              │
   │  Transaction list + search   │
   │  Budget envelopes            │
   │  Charts (trends, breakdown)  │
   │  Net worth timeline          │
   └──────────────────────────────┘
```

---

## 4. Calculos Financieros

### 4.1 Burn Rate (Tasa de Gasto Mensual)

**Simple (promedio 3 meses):**
```javascript
function burnRateSimple(monthlyExpenses) {
  // monthlyExpenses = [last3, last2, last1]
  const sum = monthlyExpenses.reduce((a, b) => a + b, 0);
  return sum / monthlyExpenses.length;
}
```

**Ponderado (meses recientes pesan mas):**
```javascript
function burnRateWeighted(monthlyExpenses) {
  // Weights: most recent = 0.50, middle = 0.33, oldest = 0.17
  const weights = [0.17, 0.33, 0.50]; // oldest to newest
  let total = 0;
  for (let i = 0; i < monthlyExpenses.length; i++) {
    total += monthlyExpenses[i] * weights[i];
  }
  return total;
}
```

**Category-aware (fijo vs variable):**
```javascript
function burnRateAware(fixedCosts, variableCostsHistory) {
  // Fixed costs son predecibles (rent, suscripciones, seguros)
  const fixedMonthly = fixedCosts.reduce((a, b) => a + b, 0);
  // Variable costs usan promedio ponderado
  const variableMonthly = burnRateWeighted(variableCostsHistory);
  return fixedMonthly + variableMonthly;
}
```

**SQL para calcular:**
```sql
SELECT
  TO_CHAR(date, 'YYYY-MM') as month,
  SUM(amount) as total_expense
FROM fin_transactions
WHERE type = 'expense'
  AND date >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY TO_CHAR(date, 'YYYY-MM')
ORDER BY month;
```

### 4.2 Runway (Meses que te Quedan)

**Basico:**
```javascript
function runway(liquidAssets, monthlyBurnRate) {
  if (monthlyBurnRate <= 0) return Infinity; // cash-flow positive
  return Math.floor(liquidAssets / monthlyBurnRate);
}
```

**Con ingreso factored in (net burn):**
```javascript
function runwayWithIncome(liquidAssets, monthlyExpenses, monthlyIncome) {
  const netBurn = monthlyExpenses - monthlyIncome;
  if (netBurn <= 0) return Infinity; // ganas mas de lo que gastas
  return Math.floor(liquidAssets / netBurn);
}
```

**Con ingreso irregular (freelance/gig):**
```javascript
function runwayConservative(liquidAssets, monthlyExpenses, incomeHistory) {
  // Usar el minimo de los ultimos 3 meses como estimacion conservadora
  const conservativeIncome = Math.min(...incomeHistory.slice(-3));
  const netBurn = monthlyExpenses - conservativeIncome;
  if (netBurn <= 0) return Infinity;
  return Math.floor(liquidAssets / netBurn);
}
```

**Proyeccion mes a mes ("Months until broke"):**
```javascript
function runwayProjection(liquidAssets, monthlyExpenses, monthlyIncome) {
  let remaining = liquidAssets;
  let month = 0;
  while (remaining > 0 && month < 120) { // max 10 anos
    remaining -= monthlyExpenses;
    remaining += monthlyIncome;
    month++;
  }
  return remaining > 0 ? Infinity : month;
}
```

### 4.3 Budget Alerts

**Modelo envelope:**
```sql
-- Tabla fin_budgets: limite por categoria por mes
CREATE TABLE fin_budgets (
    id          SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES fin_categories(id),
    month       VARCHAR(7) NOT NULL, -- 'YYYY-MM'
    amount      INTEGER NOT NULL,    -- en centavos
    carryover   INTEGER DEFAULT 0,   -- sobrante del mes anterior
    UNIQUE(category_id, month)
);
```

**Alerta cuando excede umbral:**
```sql
SELECT
  c.name as category,
  b.amount as budgeted,
  COALESCE(SUM(t.amount), 0) as spent,
  b.amount - COALESCE(SUM(t.amount), 0) as remaining,
  ROUND(COALESCE(SUM(t.amount), 0)::numeric / b.amount * 100, 1) as percent_used
FROM fin_budgets b
JOIN fin_categories c ON c.id = b.category_id
LEFT JOIN fin_transactions t ON t.category_id = b.category_id
  AND t.type = 'expense'
  AND TO_CHAR(t.date, 'YYYY-MM') = b.month
WHERE b.month = $1
GROUP BY c.name, b.amount
HAVING COALESCE(SUM(t.amount), 0) >= b.amount * 0.80  -- umbral 80%
ORDER BY percent_used DESC;
```

**Niveles de alerta:**
- 80%: Warning (amarillo) — "Vas al 82% en Groceries"
- 100%: Danger (rojo) — "Excediste el presupuesto de Transport"
- Telegram notification cuando se cruza un umbral

**Carryover (envelope rolling):**
```javascript
function calculateCarryover(budgeted, spent) {
  return budgeted - spent; // positivo = sobrante, negativo = deficit
}
// Al crear budget del proximo mes:
// new_available = new_budget + previous_carryover
```

### 4.4 Deteccion de Gastos Recurrentes

**Algoritmo SQL (interval analysis):**
```sql
WITH dated_transactions AS (
  SELECT
    payee_normalized,
    amount,
    date,
    date - LAG(date) OVER(
      PARTITION BY payee_normalized ORDER BY date
    ) AS days_between
  FROM fin_transactions
  WHERE type = 'expense'
    AND date >= CURRENT_DATE - INTERVAL '6 months'
),
recurring_candidates AS (
  SELECT
    payee_normalized,
    COUNT(*) as occurrences,
    AVG(amount) as avg_amount,
    STDDEV(amount) as amount_stddev,
    AVG(days_between) as avg_interval,
    STDDEV(days_between) as interval_stddev,
    MIN(date) as first_seen,
    MAX(date) as last_seen
  FROM dated_transactions
  WHERE days_between IS NOT NULL
  GROUP BY payee_normalized
  HAVING COUNT(*) >= 2
)
SELECT *,
  CASE
    WHEN avg_interval BETWEEN 5 AND 9 THEN 'weekly'
    WHEN avg_interval BETWEEN 12 AND 16 THEN 'fortnightly'
    WHEN avg_interval BETWEEN 25 AND 35 THEN 'monthly'
    WHEN avg_interval BETWEEN 80 AND 100 THEN 'quarterly'
    WHEN avg_interval BETWEEN 350 AND 380 THEN 'annual'
  END as detected_frequency,
  CASE
    WHEN amount_stddev < avg_amount * 0.05 THEN 'fixed'   -- <5% variacion
    WHEN amount_stddev < avg_amount * 0.30 THEN 'variable' -- <30% variacion
    ELSE 'irregular'
  END as amount_type
FROM recurring_candidates
WHERE avg_interval BETWEEN 5 AND 380
  AND interval_stddev < avg_interval * 0.3; -- consistencia de intervalo
```

**Flujo:**
1. Correr deteccion mensualmente (o en cada import)
2. Mostrar candidatos al usuario como sugerencias
3. Usuario confirma → se guarda en `fin_recurring`
4. Sistema alerta si un recurrente esperado no aparece

### 4.5 KPIs del Dashboard

| KPI | Formula | Target |
|-----|---------|--------|
| **Net Worth** | Sum(assets) - Sum(liabilities) | Creciente |
| **Savings Rate** | (Income - Expenses) / Income * 100 | > 20% |
| **Burn Rate** | Avg monthly expenses (ponderado 3 meses) | Decreciente |
| **Runway** | Liquid assets / net burn rate | > 6 meses |
| **Expense-to-Income** | Expenses / Income * 100 | < 80% |
| **Budget Compliance** | Categories within budget / total categories | > 80% |
| **Recurring % of Expenses** | Sum(recurring) / Sum(expenses) * 100 | Informativo |
| **Cash Flow** | Income - Expenses (por mes) | Positivo |
| **FI Progress** | Net worth / (Annual expenses / 0.04) * 100 | 0-100% hacia FIRE |

---

## 5. Multi-Moneda

### Estrategia: Native + NZD Equivalent

Cada transaccion almacena:
- `amount` + `currency` — monto original en la moneda de la transaccion
- `amount_nzd` — equivalente en NZD al momento de la transaccion (para reportes)

```sql
-- Transaccion en EUR (ej: compra en Espana)
INSERT INTO fin_transactions (amount, currency, amount_nzd, ...)
VALUES (4500, 'EUR', 8235, ...);  -- 45.00 EUR = 82.35 NZD al tipo del dia
-- (almacenado en centavos: 4500 = €45.00, 8235 = $82.35 NZD)
```

### Tabla de Tasas de Cambio

```sql
CREATE TABLE fin_exchange_rates (
    id          SERIAL PRIMARY KEY,
    from_cur    VARCHAR(3) NOT NULL,
    to_cur      VARCHAR(3) NOT NULL,
    rate        NUMERIC(12, 6) NOT NULL,
    date        DATE NOT NULL,
    source      VARCHAR(50) DEFAULT 'frankfurter',
    UNIQUE(from_cur, to_cur, date)
);
```

**Fuente de tasas:** Frankfurter.app (gratis, sin auth, datos ECB, soporta NZD/EUR/USD/AUD)
```
GET https://api.frankfurter.app/latest?from=NZD&to=EUR,USD,AUD
```

**Backup:** ExchangeRate-API (1500 req/mes gratis con API key)

**Wise rates como referencia:** `GET /v1/rates?source=NZD&target=USD` — mid-market rate real (mas preciso que ECB para transferencias)

**Frecuencia de actualizacion:** Diaria (ECB actualiza ~16:00 CET, lunes a viernes)

### Reportes Multi-Moneda

- **Dashboard principal:** Todo en NZD (base currency)
- **Vista detallada:** Mostrar monto original + NZD equivalent
- **Cuentas Wise:** Mostrar saldo por moneda + total en NZD
- **Historico:** Usar tasa del dia de la transaccion (ya almacenada en `amount_nzd`)
- **Balance actual:** Reconvertir con tasa actual para mostrar ganancia/perdida cambiaria

### Conversiones entre cuentas

Transfer de Wise NZD a Wise EUR:
```
1. Withdrawal: -$1000 NZD de cuenta "Wise NZD"
2. Deposit: +€547 EUR en cuenta "Wise EUR"
3. Tipo: 'transfer' (no income ni expense)
4. Ambas transacciones linked por transfer_id
```

---

## 6. Estructura de la API

### Endpoints

```
── TRANSACTIONS ──────────────────────────────────────

GET /api/v2/finance/transactions
  ?type=income|expense|transfer
  ?category=groceries|rent|...
  ?account_id=123
  ?currency=NZD|EUR|USD|AUD
  ?month=2026-04
  ?from=2026-01-01&to=2026-04-06
  ?min_amount=1000&max_amount=50000  (en centavos)
  ?search=countdown
  ?recurring=true|false
  ?sort=date|amount|category (default: date desc)
  ?limit=50&offset=0
  Response: { transactions: [...], total: N, summary: { income, expense, net } }

GET /api/v2/finance/transactions/:id
  Response: { transaction: {...}, related: [...] }

POST /api/v2/finance/transactions
  Body: { type, amount, currency, category_id, account_id, payee, description, date }
  Response: { transaction: {...} }

PATCH /api/v2/finance/transactions/:id
  Body: { category_id, payee, description, notes }

DELETE /api/v2/finance/transactions/:id

POST /api/v2/finance/transactions/import
  Body: multipart/form-data { file: CSV, bank: 'asb'|'anz'|'westpac'|'bnz'|'kiwibank', account_id: 123 }
  Response: { imported: N, duplicates_skipped: N, rules_applied: N, needs_review: [...] }

── ACCOUNTS ──────────────────────────────────────────

GET /api/v2/finance/accounts
  Response: { accounts: [...], total_balance_nzd: N }

POST /api/v2/finance/accounts
  Body: { name, type: 'asset'|'liability', currency, institution, initial_balance }

GET /api/v2/finance/accounts/:id/balance
  ?date=2026-04-06  (point-in-time balance)

── BUDGETS ───────────────────────────────────────────

GET /api/v2/finance/budgets
  ?month=2026-04
  Response: { budgets: [{ category, budgeted, spent, remaining, percent, carryover }], to_be_budgeted: N }

PUT /api/v2/finance/budgets
  Body: { month: '2026-04', allocations: [{ category_id, amount }] }

GET /api/v2/finance/budgets/alerts
  ?month=2026-04
  Response: { alerts: [{ category, percent_used, level: 'warning'|'danger' }] }

── KPIs & ANALYTICS ──────────────────────────────────

GET /api/v2/finance/summary
  ?month=2026-04
  Response: { income, expenses, net, savings_rate, burn_rate, runway_months, budget_compliance }

GET /api/v2/finance/net-worth
  ?period=MTD|YTD|1Y|Max
  Response: { current: N, history: [{ date, assets, liabilities, net_worth }], change_percent: N }

GET /api/v2/finance/trends
  ?months=12
  Response: { monthly: [{ month, income, expenses, net, savings_rate }] }

GET /api/v2/finance/breakdown
  ?month=2026-04&type=expense
  Response: { by_category: [...], by_account: [...], top_payees: [...] }

── RECURRING ─────────────────────────────────────────

GET /api/v2/finance/recurring
  Response: { confirmed: [...], suggested: [...], total_monthly: N }

POST /api/v2/finance/recurring/:id/confirm
POST /api/v2/finance/recurring/:id/dismiss

── RULES ─────────────────────────────────────────────

GET /api/v2/finance/rules
POST /api/v2/finance/rules
  Body: { name, stage: 'pre'|'default'|'post', match_mode: 'all'|'any',
          conditions: [{ field, operator, value }],
          actions: [{ type, value }] }

── EXCHANGE RATES ────────────────────────────────────

GET /api/v2/finance/rates
  ?from=NZD&to=EUR,USD,AUD
  Response: { rates: { EUR: 0.547, USD: 0.598, AUD: 0.912 }, date: '2026-04-06' }

── SAVINGS GOALS ─────────────────────────────────────

GET /api/v2/finance/goals
POST /api/v2/finance/goals
  Body: { name, target_amount, target_date, account_id }
PATCH /api/v2/finance/goals/:id/contribute
  Body: { amount }

── WISE INTEGRATION ──────────────────────────────────

GET /api/v2/finance/wise/balances
  Response: { balances: [{ currency, amount, amount_nzd }], total_nzd: N }

POST /api/v2/finance/wise/sync
  Response: { imported: N, accounts_updated: N }
```

---

## 7. Frontend — Visualizacion

### Dashboard Principal

```
┌─────────────────────────────────────────────────────────┐
│  FINANCE DASHBOARD — Abril 2026                          │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│ NET WORTH│ SAVINGS  │ BURN RATE│ RUNWAY   │ CASH FLOW   │
│ $12,450  │ Rate: 23%│ $2,340/mo│ 5.3 meses│ +$680 este  │
│ ▲ +$680  │ ▲ vs 18% │ ▼ vs 2.5k│ ▲ vs 4.8 │ mes         │
├──────────┴──────────┴──────────┴──────────┴─────────────┤
│                                                          │
│  ┌─ BUDGET ENVELOPES (Abril) ─────────────────────────┐ │
│  │ Rent        ████████████████████████ $800/$800 100% │ │
│  │ Groceries   ██████████████░░░░░░░░░ $280/$400  70% │ │
│  │ Transport   ████████░░░░░░░░░░░░░░░ $85/$200   43% │ │
│  │ Eating Out  ██████████████████░░░░░ $135/$180  75% │ │
│  │ Subs        ████████████████████████ $65/$60  108% │ │
│  │ ⚠ ALERT: Suscripciones excedio presupuesto          │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ INCOME vs EXPENSES (12 meses) ───────────────────┐ │
│  │  $3k ┤ ██                                          │ │
│  │      │ ██ ▓▓                                       │ │
│  │  $2k ┤ ██ ▓▓ ██ ▓▓ ██ ▓▓ ██ ▓▓ ...              │ │
│  │      │ ██ ▓▓ ██ ▓▓ ██ ▓▓ ██ ▓▓                   │ │
│  │  $1k ┤ ██ ▓▓ ██ ▓▓ ██ ▓▓ ██ ▓▓                   │ │
│  │      └──M───A───M───J───J───A──...                 │ │
│  │        ██ Income  ▓▓ Expenses                      │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ EXPENSE BREAKDOWN (pie chart) ────────────────────┐ │
│  │  🏠 Rent 34%  🛒 Groceries 17%  🚗 Transport 7%   │ │
│  │  🍽 Eating Out 8%  📱 Subs 4%  Other 30%           │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─ NET WORTH TIMELINE ──────────────────────────────┐  │
│  │  $15k ┤              ╱──                           │  │
│  │  $12k ┤         ╱───╱                              │  │
│  │   $9k ┤    ╱───╱                                   │  │
│  │   $6k ┤───╱                                        │  │
│  │       └──Jan──Feb──Mar──Abr                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ MULTI-CURRENCY (Wise) ───────────────────────────┐  │
│  │  NZD  $4,230.50                                    │  │
│  │  EUR  €1,245.00  (~$2,277 NZD)                     │  │
│  │  USD  $890.30    (~$1,489 NZD)                     │  │
│  │  AUD  A$340.00   (~$373 NZD)                       │  │
│  │  ─────────────────────────────                     │  │
│  │  TOTAL: $8,369.50 NZD                              │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Navegacion

```
Finance (tab principal)
├── Dashboard (KPIs + graficos)
├── Transactions
│   ├── Lista con filtros (tipo, categoria, cuenta, fecha)
│   ├── Search full-text
│   ├── Import CSV (selector de banco)
│   └── Bulk categorize
├── Budget
│   ├── Envelopes del mes actual
│   ├── Allocator (asignar dinero a categorias)
│   ├── History (meses anteriores)
│   └── Alerts (categorias excedidas)
├── Accounts
│   ├── Lista de cuentas con balance
│   ├── Wise balances (multi-moneda)
│   └── Crypto (Fase 2)
├── Recurring
│   ├── Gastos recurrentes confirmados
│   ├── Sugerencias (detectados automaticamente)
│   └── Calendario de pagos esperados
├── Analytics
│   ├── Net Worth timeline
│   ├── Income vs Expenses trend
│   ├── Breakdown by category/payee
│   ├── Savings rate trend
│   └── Runway projection
├── Goals (Piggy Banks)
│   └── Metas de ahorro con progress bars
└── Rules
    └── Auto-categorizacion configuracion
```

### Colores de Budget

- 0-60%: Verde (on track)
- 60-80%: Amarillo (atencion)
- 80-100%: Naranja (warning, Telegram alert)
- >100%: Rojo (excedido, Telegram alert)

---

## 8. Conexion con Otros Pilares

### P4 Burocracia → Finanzas

```
Cuando se sube un documento (factura, recibo):
  → OCR extrae monto + fecha + proveedor
  → Sugerir crear transaccion automaticamente
  → Link bidireccional: transaccion.document_id ↔ document.transaction_id
  
Cuando un documento (seguro, visa) tiene costo:
  → Crear transaccion y vincular a la alerta de documento
  → "Seguro medico NZ: $450/trimestre — proxima alerta: 2026-06-15"
```

### P2 Empleo → Finanzas

```
Cuando se recibe un salario (income con categoria 'salary'):
  → Verificar que coincide con el sueldo esperado del job listing
  → Actualizar runway y projections automaticamente
  
Cuando se aplica a un job con salario conocido:
  → Simular: "Si consigues este trabajo, tu savings rate seria X%"
  → Comparar salario NZ vs salario ES (ajustado por tax y costo de vida)
  
Tax estimation por pais:
  NZ: salary * 0.70 (PAYE + ACC aprox)
  AU: salary * 0.72 (tax + super)
  ES: salary * 0.65 (IRPF + SS)
```

### P6 Logistica → Finanzas

```
Cuando se crea una logistica con costo (vuelo, alojamiento):
  → Auto-crear transaccion pendiente en fin_pending
  → "Vuelo NZ→ES: $1,800 — pendiente para 2026-07"
  → Impacto en runway: "Si pagas este vuelo, runway baja a 4.1 meses"
  
Presupuesto de viaje:
  → Sumar todos los logistics.cost de un viaje planificado
  → Mostrar total vs ahorro disponible en goal "Viaje Espana"
```

### P1 Noticias → Finanzas

```
Noticias economicas relevantes:
  → Cuando un articulo de categoria 'economy' menciona NZD, EUR, o inflation
  → Badge en dashboard: "NZD cayo 2% vs USD esta semana"
  → Link a noticia relevante
```

### P5 Oportunidades → Finanzas

```
Cuando se gana un proyecto freelance:
  → Crear ingreso esperado en fin_pending
  → Tracking: "Proyecto React $2,500 — 50% pagado, 50% pendiente"
```

---

## 9. Problemas Anticipados

### Sin API Bancaria Directa (Fase 1)

- NZ no tiene open banking maduro para desarrolladores individuales
- **Mitigacion Fase 1:** CSV import mensual (5 minutos de trabajo manual)
- **Mitigacion Fase 2:** Akahu API (unico agregador NZ, free tier personal)
- **No hacer:** Screen scraping de banco (fragil, contra TOS, riesgo de seguridad)

### Conversiones de Moneda

- Frankfurter.app solo actualiza lunes-viernes (datos ECB)
- No hay rates en fines de semana o festivos
- **Mitigacion:** Usar ultima tasa conocida para fines de semana. Wise API como fuente de mid-market rate en tiempo real
- **Precision:** Para un dashboard personal, tasas ECB diarias son suficientes. No necesitamos rates intraday

### Floating Point en Dinero

- `0.1 + 0.2 !== 0.3` en JavaScript
- **Mitigacion:** Almacenar TODO en centavos como INTEGER (12030 = $120.30). Dividir por 100 solo para display
- `NUMERIC(12, 2)` en PostgreSQL (ya usado) es seguro, pero integer es mas robusto para operaciones JS

### Datos Historicos

- Al empezar, no hay datos del pasado
- **Mitigacion:** Importar CSVs de los ultimos 6-12 meses como "historical import"
- Pedir al usuario balance inicial de cada cuenta
- Net worth snapshots empiezan desde el dia 1 del sistema

### Categorizacion Inicial

- Sin reglas, todo queda como "uncategorized"
- **Mitigacion:** 
  1. Set de reglas pre-cargadas para NZ (Countdown → Groceries, Vodafone → Phone, etc.)
  2. Learn-from-behavior: despues de 3 categorizations manuales del mismo payee, crear regla
  3. Bulk categorize UI: seleccionar multiples transacciones → asignar categoria de golpe

### Payees Sucios

- Descripciones bancarias son inconsistentes: "COUNTDOWN 1234 CHCH", "Countdown Riccarton", "COUNTDOWN ONLINE"
- **Mitigacion:**
  1. Normalizar: strip numeros, lowercase, trim
  2. Fuzzy matching con fuse.js para agrupar variantes
  3. Tabla `payee_aliases(raw_text, normalized_payee)` que crece con cada import
  4. Usuario puede merge payees manualmente

### Recurrentes Falsos Positivos

- Deteccion por intervalo puede confundir compras frecuentes en el mismo lugar (supermercado semanal) con suscripciones
- **Mitigacion:** No auto-confirmar, solo sugerir. Mostrar como "Posible recurrente: Countdown ~$85/semana — Confirmar?"
- El monto debe tener baja variacion (< 30%) para contar como recurrente fijo

### Crypto Volatilidad

- Portfolio crypto cambia de valor cada segundo
- **Mitigacion:** Snapshot cada 4 horas (suficiente para dashboard personal)
- No intentar tracking en tiempo real, no somos un exchange
- Mostrar disclaimer: "Valor crypto al momento del ultimo snapshot"

---

## Resumen de Fases

### Fase 1 — Core Finanzas (Implementar ahora)

- [ ] Migrar schema: `finances`→`fin_transactions` con centavos integer, currency, account_id
- [ ] Crear tablas: `fin_accounts`, `fin_categories`, `fin_budgets`, `fin_exchange_rates`, `fin_net_worth_snapshots`
- [ ] CSV import con bank profiles (ASB, ANZ, Westpac, BNZ, Kiwibank)
- [ ] Dedup inteligente (imported_id → fuzzy match)
- [ ] Input manual (ya existe, mejorar con currency + account)
- [ ] Wise API integration (balance + transactions + rates)
- [ ] Frankfurter.app para tasas de cambio diarias
- [ ] Budget envelopes basicos (por categoria por mes)
- [ ] Budget alerts (80% y 100%)
- [ ] Calculos: burn rate, runway, savings rate, net worth
- [ ] API endpoints completos
- [ ] Frontend: dashboard KPIs, transaction list, budget view, import CSV
- [ ] Rules engine basico (match payee → set category)
- [ ] Pre-loaded rules para NZ (supermercados, telcos, rent patterns)
- [ ] Telegram alerts para budget excedido

### Fase 2 — Automatizacion

- [ ] Akahu API para sync automatico de bancos NZ
- [ ] CCXT + CoinGecko para crypto portfolio
- [ ] Deteccion automatica de recurrentes
- [ ] Learn-from-behavior categorization
- [ ] Payee normalization + fuzzy matching
- [ ] Savings goals (piggy banks)
- [ ] Net worth timeline con graficos
- [ ] Cross-pillar connections (empleo→finanzas, logistica→finanzas)

### Fase 3 — Inteligencia

- [ ] AI categorization (webhook + LLM local)
- [ ] Runway projection con escenarios (optimista/pesimista/conservador)
- [ ] Anomaly detection (gasto inusual)
- [ ] Subscription tracker (detectar subs olvidadas)
- [ ] Tax estimation por pais (NZ/AU/ES)
- [ ] FI progress tracker (Financial Independence)
- [ ] Receipt OCR → auto-create transaction
