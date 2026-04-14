// P2 jobs smoke tests — valida rows reales post-fetch en job_listings.
// Regla: no DONE sin datos reales en DB (no mocks).

import { describe, it, expect } from 'vitest';

describe('P2 Workday tenants', () => {
  it('workday TENANTS list incluye los 5 tenants nuevos (2026-04-14)', () => {
    const wd = require('../src/workday');
    const names = wd.TENANTS.map((t) => t.name.toLowerCase());
    for (const n of ['maersk', 'equinor', 'fedex', 'norwegian cruise line', 'ncl pride of america']) {
      expect(names).toContain(n);
    }
  });

  it('DB tiene jobs de sectores maritime/logistics/energy recientes', async () => {
    const db = require('../src/db');
    const row = await db.queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE sector='maritime')::int AS maritime,
         COUNT(*) FILTER (WHERE sector='logistics')::int AS logistics,
         COUNT(*) FILTER (WHERE sector='energy')::int AS energy
       FROM job_listings
       WHERE scraped_at > NOW() - INTERVAL '7 days'`
    );
    expect(row.maritime).toBeGreaterThan(0);
    expect(row.logistics).toBeGreaterThan(0);
    expect(row.energy).toBeGreaterThan(0);
  });
});

describe('P2 Maritime scrapers (CrewBay)', () => {
  it('exports fetchCrewBay + fetchAll', () => {
    const mj = require('../src/maritime_jobs');
    expect(typeof mj.fetchCrewBay).toBe('function');
    expect(typeof mj.fetchAll).toBe('function');
  });

  it('CrewBay jobs aparecen en DB con external_id crewbay:*', async () => {
    const db = require('../src/db');
    const row = await db.queryOne(
      `SELECT COUNT(*)::int AS n FROM job_listings
       WHERE external_id LIKE 'crewbay:%'`
    );
    expect(row.n).toBeGreaterThanOrEqual(10);
  });
});

describe('P2 LatAm (GetOnBoard)', () => {
  it('latam_jobs exporta CATEGORIES, fetchCategory, fetchAll', () => {
    const lj = require('../src/latam_jobs');
    expect(Array.isArray(lj.CATEGORIES)).toBe(true);
    expect(lj.CATEGORIES.length).toBeGreaterThanOrEqual(5);
    expect(typeof lj.fetchCategory).toBe('function');
  });

  it('DB tiene jobs LatAm (category=latam) presenciales', async () => {
    const db = require('../src/db');
    const row = await db.queryOne(
      `SELECT COUNT(*)::int AS n,
              COUNT(DISTINCT location_country)::int AS countries
       FROM job_listings WHERE category='latam' AND is_remote=false`
    );
    expect(row.n).toBeGreaterThan(50);
    expect(row.countries).toBeGreaterThanOrEqual(3);
  });
});

describe('P2 visa sponsors (pre-existente, R4)', () => {
  it('emp_visa_sponsors tiene ≥10 países', async () => {
    const db = require('../src/db');
    const row = await db.queryOne(
      `SELECT COUNT(DISTINCT country)::int AS n FROM emp_visa_sponsors`
    );
    expect(row.n).toBeGreaterThanOrEqual(10);
  });
});

describe('P2 deep portals (DPW/BHP/RCG/Torre)', () => {
  it('p2_deep_jobs exporta los 4 fetchers + fetchAll', () => {
    const dj = require('../src/p2_deep_jobs');
    for (const fn of ['fetchDPWorld', 'fetchBHP', 'fetchRCG', 'fetchTorre', 'fetchAll']) {
      expect(typeof dj[fn]).toBe('function');
    }
  });

  it('DB tiene jobs de dpworld/bhp/rcg/torre external_ids', async () => {
    const db = require('../src/db');
    const row = await db.queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE external_id LIKE 'dpworld:%')::int AS dpworld,
         COUNT(*) FILTER (WHERE external_id LIKE 'bhp:%')::int AS bhp,
         COUNT(*) FILTER (WHERE external_id LIKE 'rcg:%')::int AS rcg,
         COUNT(*) FILTER (WHERE external_id LIKE 'torre:%')::int AS torre
       FROM job_listings`
    );
    expect(row.dpworld).toBeGreaterThanOrEqual(50);
    expect(row.bhp).toBeGreaterThanOrEqual(20);
    expect(row.rcg).toBeGreaterThanOrEqual(20);
    expect(row.torre).toBeGreaterThanOrEqual(1);
  });

  it('sector=mining/logistics aparece con rows recientes', async () => {
    const db = require('../src/db');
    const row = await db.queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE sector='mining')::int AS mining,
         COUNT(*) FILTER (WHERE company='DP World')::int AS dpw_company
       FROM job_listings WHERE scraped_at > NOW() - INTERVAL '2 hours'`
    );
    expect(row.mining).toBeGreaterThan(0);
    expect(row.dpw_company).toBeGreaterThan(0);
  });
});
