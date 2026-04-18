// Contract test for /api/admin/status against the live container.
// P0-1.3 dump: detalla scheduler jobs + recentLogs + scraping data.
//
// Usage: docker exec ultra_engine npx vitest run tests/admin-status.test.js

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3000';
const EMAIL = process.env.WM_TEST_EMAIL || 'admin@ibrahim.ops';
const PASSWORD = process.env.WM_TEST_PASSWORD || 'nIJAudyZs2dSWr0';

let COOKIE = '';

const AdminStatus = z.object({
  ok: z.literal(true),
  data: z.object({
    system: z.object({
      uptime: z.number().nonnegative(),
      db: z.unknown(),
      timezone: z.string(),
      version: z.string(),
    }),
    documents: z.object({
      total: z.number().int().nonnegative(),
      active: z.number().int().nonnegative(),
      urgent: z.number().int().nonnegative(),
      expired: z.number().int().nonnegative(),
    }),
    news: z.object({
      feeds: z.number().int().nonnegative(),
      articles: z.number().int().nonnegative(),
    }),
    jobs: z.object({
      sources: z.number().int().nonnegative(),
      listings: z.number().int().nonnegative(),
    }),
    scheduler: z.object({
      jobs: z.array(z.unknown()),
      recentLogs: z.array(z.unknown()),
    }),
  }),
});

beforeAll(async () => {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(`${ENGINE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    if (r.status === 429) {
      await new Promise((res) => setTimeout(res, attempt * 2000));
      continue;
    }
    const setCookie = r.headers.get('set-cookie') || '';
    const m = setCookie.match(/ultra_session=([^;]+)/);
    if (!m) throw new Error(`login failed: ${r.status} no cookie set`);
    COOKIE = `ultra_session=${m[1]}`;
    return;
  }
  throw new Error('login failed: rate-limited after 6 retries');
}, 30_000);

async function getAdminStatus() {
  const res = await fetch(`${ENGINE_URL}/api/admin/status`, { headers: { Cookie: COOKIE } });
  return { status: res.status, body: await res.json().catch(() => null) };
}

describe('/api/admin/status', () => {
  it('returns 200 with cookie', async () => {
    const { status } = await getAdminStatus();
    expect(status).toBe(200);
  });

  it('response matches AdminStatus schema', async () => {
    const { body } = await getAdminStatus();
    const parsed = AdminStatus.safeParse(body);
    if (!parsed.success) {
      console.error('Schema failures:', JSON.stringify(parsed.error.issues, null, 2));
    }
    expect(parsed.success).toBe(true);
  });

  it('scheduler.jobs is a non-empty array (85 registered jobs)', async () => {
    const { body } = await getAdminStatus();
    expect(body.data.scheduler.jobs.length).toBeGreaterThan(0);
  });

  it('returns 401 without cookie', async () => {
    const res = await fetch(`${ENGINE_URL}/api/admin/status`);
    expect(res.status).toBe(401);
  });
});
