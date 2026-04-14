// Integration tests for all /api/wm/* endpoints.
// Runs against the live DB (requires containers running).
//
// Usage:
//   docker exec ultra_engine npx vitest run tests/wm-endpoints.test.js
//
// Login uses real admin credentials; on a fresh DB these tests will fail
// until at least one user exists and some articles have been ingested.

import { describe, it, expect, beforeAll } from 'vitest';

const ENGINE_URL = process.env.ENGINE_URL || 'http://localhost:3000';
const EMAIL = process.env.WM_TEST_EMAIL || 'admin@ibrahim.ops';
const PASSWORD = process.env.WM_TEST_PASSWORD || 'nIJAudyZs2dSWr0';

let TOKEN = '';

async function wmGet(path) {
  const res = await fetch(`${ENGINE_URL}/api/wm${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  const body = res.ok ? await res.json() : null;
  return { status: res.status, body };
}

beforeAll(async () => {
  const r = await fetch(`${ENGINE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login failed: ${r.status}`);
  TOKEN = (await r.json()).token;
});

// ─── NEWS MODULE ──────────────────────────────────────────

describe('wm/news module', () => {
  it('GET /summary returns top countries, focal points, trending', async () => {
    const { status, body } = await wmGet('/summary');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.top_countries).toBeInstanceOf(Array);
    expect(body.top_focal_points).toBeInstanceOf(Array);
    expect(body.top_trending).toBeInstanceOf(Array);
    expect(body.top_multi_source_clusters).toBeInstanceOf(Array);
  });

  it('GET /news/country/:iso with valid ISO returns articles', async () => {
    const { status, body } = await wmGet('/news/country/US?limit=5');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.country).toBe('US');
    expect(body.data).toBeInstanceOf(Array);
  });

  it('GET /news/country/:iso with invalid ISO returns 400', async () => {
    // "1!" is not a valid ISO (non-alpha) — backend validates /^[A-Z]{2}$/
    const { status } = await wmGet('/news/country/1!');
    expect(status).toBe(400);
  });

  it('GET /news/topic/:topic returns articles', async () => {
    const { status, body } = await wmGet('/news/topic/geopolitics?limit=5');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.topic).toBe('geopolitics');
  });

  it('GET /news/region/:region works for continent', async () => {
    const { status, body } = await wmGet('/news/region/Europe?limit=5');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('GET /news/summary returns continents + topics + feed_health', async () => {
    const { status, body } = await wmGet('/news/summary');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.continents).toBe('object');
    expect(body.topics).toBeInstanceOf(Array);
    expect(body.feed_health).toBeTruthy();
  });

  it('GET /news/filtered at country level with topics', async () => {
    const { status, body } = await wmGet('/news/filtered?level=country&value=FR&hours=48&limit=10&topics=football_soccer');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.level).toBe('country');
    expect(body.topics).toEqual(['football_soccer']);
  });

  it('GET /news/filtered at world level', async () => {
    const { status, body } = await wmGet('/news/filtered?level=world&hours=24&limit=10');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it('GET /news/activity returns per-country counts', async () => {
    const { status, body } = await wmGet('/news/activity?hours=48');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toBeInstanceOf(Array);
    if (body.data.length) expect(body.data[0]).toHaveProperty('country_iso');
  });

  it('GET /news/timeline returns per-country sparkline data', async () => {
    const { status, body } = await wmGet('/news/timeline?days=7');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.data).toBe('object');
  });

  it('GET /news/pulse returns volume + top_by_continent + topic_spikes', async () => {
    const { status, body } = await wmGet('/news/pulse');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.volume).toBeTruthy();
    expect(body.top_by_continent).toBeInstanceOf(Array);
    expect(body.topic_spikes).toBeInstanceOf(Array);
  });
});

// ─── MAP MODULE ───────────────────────────────────────────

describe('wm/map module', () => {
  const endpoints = [
    { path: '/map/flights', checkKeys: ['military', 'commercial'] },
    { path: '/map/vessels', checkKeys: ['military', 'commercial'] },
    { path: '/map/fires' },
    { path: '/map/quakes' },
    { path: '/map/countries', checkKeys: ['sentiment', 'gdelt', 'scores', 'alerts'] },
    { path: '/map/events' },
    { path: '/map/outages' },
    { path: '/map/bases' },
    { path: '/map/pipelines' },
    { path: '/map/ports' },
    { path: '/map/hotspots' },
    { path: '/map/nuclear' },
    { path: '/map/cables' },
    { path: '/map/waterways' },
    { path: '/map/economic' },
    { path: '/map/conflicts' },
    { path: '/map/disasters' },
  ];

  for (const ep of endpoints) {
    it(`GET ${ep.path} returns ok`, async () => {
      const { status, body } = await wmGet(ep.path);
      expect(status).toBe(200);
      expect(body.ok).toBe(true);
      if (ep.checkKeys) {
        for (const k of ep.checkKeys) expect(body.data).toHaveProperty(k);
      }
    });
  }

  it('GET /map/geojson returns FeatureCollection', async () => {
    const { status, body } = await wmGet('/map/geojson');
    expect(status).toBe(200);
    expect(body.type).toBe('FeatureCollection');
    expect(body.features).toBeInstanceOf(Array);
  });
});

// ─── MARKETS MODULE ───────────────────────────────────────

describe('wm/markets module', () => {
  it('GET /markets/snapshot returns 10 datasets', async () => {
    const { status, body } = await wmGet('/markets/snapshot');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    const data = body.data;
    for (const k of ['indices', 'commodities', 'crypto', 'fx', 'energy', 'macro', 'signals', 'predictions', 'topMovers', 'kpis']) {
      expect(data).toHaveProperty(k);
    }
  });

  it('GET /intelligence-brief returns signal_context + focal_points + nexus', async () => {
    const { status, body } = await wmGet('/intelligence-brief');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toHaveProperty('signal_context');
    expect(body.data.focal_points).toBeInstanceOf(Array);
    expect(body.data.nexus).toBeInstanceOf(Array);
    expect(body.data.convergence_zones).toBeInstanceOf(Array);
  });

  it('GET /markets/sparklines returns symbol → points map', async () => {
    const { status, body } = await wmGet('/markets/sparklines');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(typeof body.data).toBe('object');
  });
});

// ─── ARTICLE MODULE ───────────────────────────────────────

describe('wm/article module', () => {
  let sampleId = null;

  beforeAll(async () => {
    // Find any article ID to test with
    const { body } = await wmGet('/news/filtered?level=world&hours=48&limit=1');
    if (body?.data?.length) sampleId = body.data[0].article_id;
  });

  it('GET /article/:id returns full details', async () => {
    if (!sampleId) return;
    const { status, body } = await wmGet(`/article/${sampleId}`);
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.article).toBeTruthy();
    expect(body.data.article).toHaveProperty('title');
    expect(body.data.article).toHaveProperty('reading_time_min');
  });

  it('GET /article/:id with invalid id returns 400 or 404', async () => {
    const { status } = await wmGet('/article/not-a-number');
    expect([400, 404]).toContain(status);
  });

  it('GET /article/999999999 returns 404', async () => {
    const { status } = await wmGet('/article/999999999');
    expect(status).toBe(404);
  });
});

// ─── SEARCH MODULE ────────────────────────────────────────

describe('wm/search module', () => {
  it('GET /search with short query returns empty', async () => {
    const { status, body } = await wmGet('/search?q=a');
    expect(status).toBe(200);
    expect(body.count).toBe(0);
  });

  it('GET /search with valid query returns ranked results', async () => {
    const { status, body } = await wmGet('/search?q=ukraine&hours=168&limit=5');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toBeInstanceOf(Array);
    if (body.data.length >= 2) {
      // Results should be sorted by rank descending
      expect(parseFloat(body.data[0].rank)).toBeGreaterThanOrEqual(parseFloat(body.data[1].rank));
    }
  });

  it('GET /search/suggest returns trending + titles', async () => {
    const { status, body } = await wmGet('/search/suggest?q=trump');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toBeInstanceOf(Array);
    // Each suggestion has type + value
    for (const s of body.data) {
      expect(['trending', 'title']).toContain(s.type);
      expect(s.value).toBeTruthy();
    }
  });
});

// ─── COMPARE MODULE ───────────────────────────────────────

describe('wm/compare module', () => {
  it('GET /compare?isos=US,FR returns country data', async () => {
    const { status, body } = await wmGet('/compare?isos=US,FR&hours=48');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(body.data).toBeInstanceOf(Array);
    expect(body.data[0].iso).toBe('US');
    expect(body.data[1].iso).toBe('FR');
  });

  it('GET /compare without isos returns 400', async () => {
    const { status } = await wmGet('/compare');
    expect(status).toBe(400);
  });

  it('GET /compare with >4 countries caps at 4', async () => {
    const { status, body } = await wmGet('/compare?isos=US,FR,DE,RU,UA,JP');
    expect(status).toBe(200);
    expect(body.count).toBeLessThanOrEqual(4);
  });

  it('GET /compare data has expected structure', async () => {
    const { body } = await wmGet('/compare?isos=FR');
    expect(body.data[0]).toHaveProperty('activity');
    expect(body.data[0]).toHaveProperty('sentiment');
    expect(body.data[0]).toHaveProperty('risk');
    expect(body.data[0]).toHaveProperty('timeline');
    expect(body.data[0]).toHaveProperty('top_article');
  });
});

// ─── MISC MODULE ──────────────────────────────────────────

describe('wm/misc module', () => {
  it('GET /geo-hierarchy returns continents + topicGroups', async () => {
    const { status, body } = await wmGet('/geo-hierarchy');
    expect(status).toBe(200);
    expect(body.continents).toBeInstanceOf(Array);
    expect(body.topicGroups).toBeInstanceOf(Array);
  });
});

// ─── SSRF / URL SAFETY ───────────────────────────────────

describe('wm/url-safety helpers', () => {
  const { validateOutboundUrl } = require('../src/routes/wm/url-safety');

  it('accepts public https URLs', () => {
    expect(validateOutboundUrl('https://www.bbc.com/news').ok).toBe(true);
    expect(validateOutboundUrl('http://example.org/article').ok).toBe(true);
  });

  it('rejects private IPv4 ranges', () => {
    expect(validateOutboundUrl('http://10.0.0.1/').ok).toBe(false);
    expect(validateOutboundUrl('http://192.168.1.1/').ok).toBe(false);
    expect(validateOutboundUrl('http://172.17.0.1/').ok).toBe(false);
    expect(validateOutboundUrl('http://127.0.0.1/').ok).toBe(false);
  });

  it('rejects AWS/GCP metadata endpoints', () => {
    expect(validateOutboundUrl('http://169.254.169.254/latest/meta-data/').ok).toBe(false);
    expect(validateOutboundUrl('http://metadata.google.internal/').ok).toBe(false);
  });

  it('rejects internal docker hostnames', () => {
    expect(validateOutboundUrl('http://ultra_db:5432/').ok).toBe(false);
    expect(validateOutboundUrl('http://ultra_nlp:8000/translate').ok).toBe(false);
    expect(validateOutboundUrl('http://localhost/admin').ok).toBe(false);
  });

  it('rejects non-HTTP schemes', () => {
    expect(validateOutboundUrl('file:///etc/passwd').ok).toBe(false);
    expect(validateOutboundUrl('gopher://example.com/').ok).toBe(false);
    expect(validateOutboundUrl('data:text/html,<script>').ok).toBe(false);
  });

  it('rejects non-standard ports', () => {
    expect(validateOutboundUrl('http://example.com:22/').ok).toBe(false);
    expect(validateOutboundUrl('http://example.com:5432/').ok).toBe(false);
    expect(validateOutboundUrl('http://example.com:8080/').ok).toBe(true);
  });

  it('rejects IPv6 loopback/link-local', () => {
    expect(validateOutboundUrl('http://[::1]/').ok).toBe(false);
    expect(validateOutboundUrl('http://[fe80::1]/').ok).toBe(false);
    expect(validateOutboundUrl('http://[fc00::1]/').ok).toBe(false);
  });
});

// ─── CONSTANTS UNIT TESTS ─────────────────────────────────

describe('wm/constants helpers', () => {
  it('COUNTRY_ALIASES covers major countries', () => {
    const { COUNTRY_ALIASES } = require('../src/routes/wm/constants');
    expect(COUNTRY_ALIASES.US).toContain('United States');
    expect(COUNTRY_ALIASES.FR).toContain('France');
    expect(COUNTRY_ALIASES.DZ).toContain('Algeria');
    expect(COUNTRY_ALIASES.RU).toContain('Russia');
  });

  it('TOPIC_KEYWORDS covers sports with multilingual terms', () => {
    const { TOPIC_KEYWORDS } = require('../src/routes/wm/constants');
    const football = TOPIC_KEYWORDS.football_soccer;
    expect(football).toContain('football');
    expect(football).toContain('fútbol');
    expect(football).toContain('La Liga');
  });

  it('buildTopicRegex wraps short keywords with word boundaries', () => {
    const { buildTopicRegex } = require('../src/routes/wm/constants');
    const regex = buildTopicRegex(['combat_sports']);
    // MMA must have word boundaries to avoid matching "summary"
    expect(regex).toMatch(/\\yMMA\\y/);
  });

  it('buildTopicRegex returns empty for empty input', () => {
    const { buildTopicRegex } = require('../src/routes/wm/constants');
    expect(buildTopicRegex([])).toBe('');
    expect(buildTopicRegex(null)).toBe('');
  });

  it('buildCountryRegex escapes regex metacharacters', () => {
    const { buildCountryRegex } = require('../src/routes/wm/constants');
    const regex = buildCountryRegex(['France', 'French.']);
    expect(regex).toContain('France');
    expect(regex).toContain('French\\.');
  });

  it('getCountryTerms falls back to ISO when no alias', () => {
    const { getCountryTerms } = require('../src/routes/wm/constants');
    const terms = getCountryTerms('XX'); // non-existent ISO
    expect(terms).toEqual(['XX']);
  });
});
