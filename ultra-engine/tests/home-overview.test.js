// Contract test for /api/home/overview against the live container.
// Pattern: clones finances-endpoints.test.js (login → cookie → assert).
// Validates response with a Zod schema mirroring web/src/lib/zod-schemas.ts.
//
// Usage: docker exec ultra_engine npx vitest run tests/home-overview.test.js

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3000';
const EMAIL = process.env.WM_TEST_EMAIL || 'admin@ibrahim.ops';
const PASSWORD = process.env.WM_TEST_PASSWORD || 'nIJAudyZs2dSWr0';

let COOKIE = '';

const Badge = z.enum(['none', 'info', 'warn', 'alert']);
const Section = z.object({
  status: z.enum(['ok', 'empty', 'error']),
  kpi: z.union([z.number(), z.string(), z.null()]),
  label: z.string().nullable(),
  badge: Badge,
  preview: z.array(z.object({
    id: z.string(),
    text: z.string(),
    meta: z.string().nullable(),
  })).max(5).nullable(),
  priorityScore: z.number().int().min(0).max(100),
  error: z.string().nullable(),
});
const HomeOverview = z.object({
  generatedAt: z.string().datetime(),
  mustDo: z.array(z.object({
    id: z.string(),
    source: z.enum(['bureaucracy', 'logistics', 'bio', 'money']),
    title: z.string(),
    dueAt: z.string().datetime().nullable(),
    severity: z.enum(['low', 'med', 'high']),
    href: z.string(),
  })).max(5),
  partial: z.boolean(),
  me: Section, work: Section, money: Section, moves: Section, world: Section,
});

beforeAll(async () => {
  const r = await fetch(`${ENGINE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const setCookie = r.headers.get('set-cookie') || '';
  const m = setCookie.match(/ultra_session=([^;]+)/);
  if (!m) throw new Error('login failed: no cookie set');
  COOKIE = `ultra_session=${m[1]}`;
});

async function getOverview() {
  const res = await fetch(`${ENGINE_URL}/api/home/overview`, { headers: { Cookie: COOKIE } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('/api/home/overview', () => {
  it('returns 200 with cookie', async () => {
    const { status } = await getOverview();
    expect(status).toBe(200);
  });

  it('response matches HomeOverview schema (Zod parse)', async () => {
    const { body } = await getOverview();
    const parsed = HomeOverview.safeParse(body);
    if (!parsed.success) {
      console.error('Schema failures:', JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.success).toBe(true);
  });

  it('mustDo is bounded to 5 items', async () => {
    const { body } = await getOverview();
    expect(body.mustDo.length).toBeLessThanOrEqual(5);
  });

  it('every section has priorityScore in [0,100]', async () => {
    const { body } = await getOverview();
    for (const k of ['me', 'work', 'money', 'moves', 'world']) {
      expect(body[k].priorityScore).toBeGreaterThanOrEqual(0);
      expect(body[k].priorityScore).toBeLessThanOrEqual(100);
    }
  });

  it('returns 401 without cookie', async () => {
    const r = await fetch(`${ENGINE_URL}/api/home/overview`);
    expect(r.status).toBe(401);
  });
});

// ─── Unit-ish tests para los domain helpers ──────────────────
describe('domain helpers', () => {
  it('home-cache.getOrCompute with TTL=0 always recomputes', async () => {
    const { getOrCompute, clear } = require('../src/domain/home-cache');
    clear();
    let calls = 0;
    const fn = async () => { calls++; return calls; };
    expect(await getOrCompute('k', 0, fn)).toBe(1);
    expect(await getOrCompute('k', 0, fn)).toBe(2);
    expect(calls).toBe(2);
  });

  it('home-cache.getOrCompute with TTL>0 reuses', async () => {
    const { getOrCompute, clear } = require('../src/domain/home-cache');
    clear();
    let calls = 0;
    const fn = async () => { calls++; return 'x'; };
    await getOrCompute('k2', 60_000, fn);
    await getOrCompute('k2', 60_000, fn);
    expect(calls).toBe(1);
  });
});
