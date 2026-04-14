// Integration tests for /api/finances/* endpoints (P3).
// Runs against the live DB (requires containers running + seed_p3_demo.sql).
//
// Usage:
//   docker exec ultra_engine npx vitest run tests/finances-endpoints.test.js

import { describe, it, expect, beforeAll } from 'vitest';

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3000';
const EMAIL = process.env.WM_TEST_EMAIL || 'admin@ibrahim.ops';
const PASSWORD = process.env.WM_TEST_PASSWORD || 'nIJAudyZs2dSWr0';

let TOKEN = '';

async function fGet(path) {
  const res = await fetch(`${ENGINE_URL}/api/finances${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

beforeAll(async () => {
  const r = await fetch(`${ENGINE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const j = await r.json();
  if (!j.token) throw new Error('login failed: ' + JSON.stringify(j));
  TOKEN = j.token;
});

describe('P3 — Money Cockpit endpoints', () => {
  it('GET /summary — month aggregate', async () => {
    const { status, body } = await fGet('/summary');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty('month');
    expect(body.data).toHaveProperty('balance');
  });

  it('GET /budget — current month + runway', async () => {
    const { status, body } = await fGet('/budget');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('runway_days');
    expect(Array.isArray(body.data.by_category)).toBe(true);
  });

  it('GET /budget/carryover — envelope with monthsBack', async () => {
    const { status, body } = await fGet('/budget/carryover?month=2026-04&monthsBack=3');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length) {
      const c = body.data[0];
      expect(c).toHaveProperty('carryover_balance');
      expect(c).toHaveProperty('effective_limit');
      expect(c).toHaveProperty('history');
    }
  });

  it('GET /runway — extended runway with NW snapshot', async () => {
    const { status, body } = await fGet('/runway');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('burn_rate_90d');
    expect(body.data).toHaveProperty('runway_days_90d');
    expect(body.data).toHaveProperty('by_account');
  });

  it('GET /recurring — confidence-ranked subscriptions', async () => {
    const { status, body } = await fGet('/recurring');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    body.data.forEach(r => {
      expect(parseFloat(r.confidence)).toBeGreaterThanOrEqual(0.5);
    });
  });

  it('GET /savings-goals — active goals with progress_pct', async () => {
    const { status, body } = await fGet('/savings-goals');
    expect(status).toBe(200);
    body.data.forEach(g => {
      expect(g).toHaveProperty('progress_pct');
      expect(g).toHaveProperty('days_remaining');
    });
  });

  it('GET /nw-timeline — period trend', async () => {
    const { status, body } = await fGet('/nw-timeline?days=90');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
    if (body.data.length >= 2) {
      expect(body.trend).toHaveProperty('delta_nzd');
      expect(body.trend).toHaveProperty('avg_daily_change_nzd');
    }
  });

  it('GET /investments — positions with valuation', async () => {
    const { status, body } = await fGet('/investments');
    expect(status).toBe(200);
    expect(Array.isArray(body.positions)).toBe(true);
  });

  it('GET /crypto — holdings with NZD value', async () => {
    const { status, body } = await fGet('/crypto');
    expect(status).toBe(200);
    expect(Array.isArray(body.holdings)).toBe(true);
  });

  it('GET /providers — integration status table', async () => {
    const { status, body } = await fGet('/providers');
    expect(status).toBe(200);
    expect(Array.isArray(body.providers)).toBe(true);
    expect(body.providers.length).toBeGreaterThanOrEqual(5);
    body.providers.forEach(p => {
      expect(p).toHaveProperty('configured');
      expect(p).toHaveProperty('docs');
    });
  });

  it('GET /fx — cached rates base NZD', async () => {
    const { status, body } = await fGet('/fx');
    expect(status).toBe(200);
    expect(body.base).toBe('NZD');
  });

  it('GET /tax/paye-nz — bracket math', async () => {
    const { status, body } = await fGet('/tax/paye-nz?gross=72000');
    expect(status).toBe(200);
    expect(body.data.tax_payable_nzd).toBeGreaterThan(0);
    expect(body.data.net_nzd).toBeLessThan(72000);
    expect(body.data.brackets).toBeDefined();
  });

  it('GET /tax/residency-es — 183-day counter', async () => {
    const { status, body } = await fGet('/tax/residency-es');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('threshold_days', 183);
    expect(body.data).toHaveProperty('is_resident');
  });

  it('GET /tax/modelo-720 — foreign assets aggregate', async () => {
    const { status, body } = await fGet('/tax/modelo-720?year=2026');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('threshold_eur', 50000);
    expect(body.data).toHaveProperty('obligated');
  });

  it('GET /tax/modelo-721 — crypto declaration', async () => {
    const { status, body } = await fGet('/tax/modelo-721?year=2026');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('threshold_eur', 50000);
    expect(body.data).toHaveProperty('items');
  });

  it('GET /tax/fif-nz — offshore investments', async () => {
    const { status, body } = await fGet('/tax/fif-nz');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('total_cost_nzd');
    expect(body.data).toHaveProperty('exempt');
  });

  it('GET /tax/beckham — comparison vs IRPF', async () => {
    const { status, body } = await fGet('/tax/beckham?gross=80000');
    expect(status).toBe(200);
    expect(body.data.beckham).toHaveProperty('tax_eur');
    expect(body.data.irpf_standard).toHaveProperty('tax_eur');
    expect(body.data).toHaveProperty('beckham_better');
  });
});

describe('P3 v2 — endpoints surfaced in cockpit panels', () => {
  it('GET / — recent transaction list', async () => {
    const { status, body } = await fGet('/?limit=10');
    expect(status).toBe(200);
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET / — type filter expense', async () => {
    const { status, body } = await fGet('/?type=expense&limit=5');
    expect(status).toBe(200);
    body.data.forEach(t => expect(t.type).toBe('expense'));
  });

  it('GET /alerts — over-threshold categories', async () => {
    const { status, body } = await fGet('/alerts');
    expect(status).toBe(200);
    expect(body).toHaveProperty('threshold');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('GET /import-csv/profiles — bank profile map', async () => {
    const { status, body } = await fGet('/import-csv/profiles');
    expect(status).toBe(200);
    expect(typeof body.data).toBe('object');
    expect(Object.keys(body.data).length).toBeGreaterThanOrEqual(5);
  });

  it('GET /investments/quote/:symbol — Stooq lookup', async () => {
    const { status, body } = await fGet('/investments/quote/AAPL.US');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('close');
    expect(body.data).toHaveProperty('currency');
  });

  it('GET /investments/performance — period returns', async () => {
    const { status, body } = await fGet('/investments/performance?symbol=AAPL.US');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('periods');
    expect(body.data).toHaveProperty('last_close');
  });

  it('GET /investments/twr — Sharpe + annualized', async () => {
    const { status, body } = await fGet('/investments/twr?symbol=AAPL.US&rf=0.04');
    expect(status).toBe(200);
    expect(body.data).toHaveProperty('sharpe_ratio');
    expect(body.data).toHaveProperty('annualized_return_pct');
    expect(body.data).toHaveProperty('annualized_volatility_pct');
  });

  it('Modelo 720 includes itemised account list', async () => {
    const { status, body } = await fGet('/tax/modelo-720?year=2026');
    expect(status).toBe(200);
    const items = body.data?.categoria_1_cuentas_extranjero?.items;
    expect(Array.isArray(items)).toBe(true);
  });

  it('Modelo 721 includes itemised holdings list', async () => {
    const { status, body } = await fGet('/tax/modelo-721?year=2026');
    expect(status).toBe(200);
    expect(Array.isArray(body.data.items)).toBe(true);
  });

  it('Modelo 100 includes breakdown rows', async () => {
    const { status, body } = await fGet('/tax/modelo-100?year=2026');
    expect(status).toBe(200);
    expect(Array.isArray(body.data.breakdown)).toBe(true);
    expect(body.data).toHaveProperty('sections');
  });

  it('Runway includes by_account breakdown', async () => {
    const { status, body } = await fGet('/runway');
    expect(status).toBe(200);
    expect(Array.isArray(body.data.by_account)).toBe(true);
  });

  it('Summary includes byCategory breakdown', async () => {
    const { status, body } = await fGet('/summary');
    expect(status).toBe(200);
    expect(Array.isArray(body.data.byCategory)).toBe(true);
  });
});

describe('P3 — Money Cockpit asset routes', () => {
  it('GET /money.html — protected, serves cockpit shell', async () => {
    const r = await fetch(`${ENGINE_URL}/money.html`, {
      headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'text/html' },
    });
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('Money Cockpit');
    expect(html).toContain('workspace-select');
  });

  it('GET /money.html — without auth → 302 to login', async () => {
    const r = await fetch(`${ENGINE_URL}/money.html`, {
      headers: { Accept: 'text/html' },
      redirect: 'manual',
    });
    expect([301, 302]).toContain(r.status);
  });

  it('GET /money.css — public asset', async () => {
    const r = await fetch(`${ENGINE_URL}/money.css`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/css/);
  });

  it('GET /money.js — public asset', async () => {
    const r = await fetch(`${ENGINE_URL}/money.js`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/javascript/);
  });
});
