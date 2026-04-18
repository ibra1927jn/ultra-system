// Contract test for GET /api/jobs/search-local (added 2026-04-18 for Work/Matches
// tab en SPA). Patrón: login → cookie → assert shape + filter behaviour.
//
// Usage: docker exec ultra_engine npx vitest run tests/jobs-search-local.test.js

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3000';
const EMAIL = process.env.WM_TEST_EMAIL || 'admin@ibrahim.ops';
const PASSWORD = process.env.WM_TEST_PASSWORD || 'nIJAudyZs2dSWr0';

let COOKIE = '';

const JobRow = z.object({
  id: z.number(),
  title: z.string(),
  company: z.string().nullable(),
  url: z.string().nullable(),
  total_score: z.number(),
  has_sponsor: z.boolean(),
}).passthrough();

const ResponseShape = z.object({
  ok: z.literal(true),
  count: z.number(),
  data: z.array(JobRow),
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

async function get(qs = '') {
  const res = await fetch(`${ENGINE_URL}/api/jobs/search-local${qs ? `?${qs}` : ''}`, {
    headers: { Cookie: COOKIE },
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('/api/jobs/search-local', () => {
  it('returns 401 without cookie', async () => {
    const res = await fetch(`${ENGINE_URL}/api/jobs/search-local`);
    expect(res.status).toBe(401);
  });

  it('returns 200 with cookie + matches schema (default)', async () => {
    const { status, body } = await get('limit=5');
    expect(status).toBe(200);
    const parsed = ResponseShape.safeParse(body);
    if (!parsed.success) console.error('Schema failures:', JSON.stringify(parsed.error.issues, null, 2));
    expect(parsed.success).toBe(true);
  });

  it('min_score filters to ≥ the threshold', async () => {
    const { body } = await get('min_score=50&limit=10');
    expect(body.data.length).toBeGreaterThan(0);
    for (const row of body.data) {
      expect(row.total_score).toBeGreaterThanOrEqual(50);
    }
  });

  it('q filter returns subset (substring in title/company/description)', async () => {
    const { body } = await get('q=engineer&limit=10');
    expect(body.data.length).toBeGreaterThan(0);
  });

  it('country=NZ filters to NZ jobs only', async () => {
    const { body } = await get('country=NZ&limit=10');
    for (const row of body.data) {
      expect(row.location_country).toBe('NZ');
    }
  });

  it('remote=true filters to is_remote=TRUE', async () => {
    const { body } = await get('remote=true&limit=10');
    for (const row of body.data) {
      expect(row.is_remote).toBe(true);
    }
  });

  it('has_sponsor field is present (boolean)', async () => {
    const { body } = await get('limit=3');
    for (const row of body.data) {
      expect(typeof row.has_sponsor).toBe('boolean');
    }
  });

  it('duplicate_of IS NULL filter is always active (no dupes in results)', async () => {
    const { body } = await get('limit=50');
    // Si hay dupes en DB y el filter funciona, ninguno se cuela.
    for (const row of body.data) {
      expect(row.duplicate_of).toBeFalsy();
    }
  });
});
