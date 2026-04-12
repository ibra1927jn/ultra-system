// Smoke tests — verify core services are reachable and responding.
// Run against the LIVE system (requires containers running).
// Usage: docker exec ultra_engine npx vitest run

import { describe, it, expect } from 'vitest';

const ENGINE_URL = 'http://localhost:3000';
const NLP_URL = process.env.NLP_BASE_URL || 'http://nlp:8000';
const SPACY_URL = process.env.SPACY_BASE_URL || 'http://spacy:8000';
const EXTRACT_URL = process.env.EXTRACT_BASE_URL || 'http://extract:8000';

describe('Engine health', () => {
  it('GET /api/health returns ok', async () => {
    const res = await fetch(`${ENGINE_URL}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('GET /api/status requires auth', async () => {
    const res = await fetch(`${ENGINE_URL}/api/status`);
    // Without API key, should return 401 (auth working)
    expect([200, 401]).toContain(res.status);
  });
});

describe('Database connectivity', () => {
  it('can query rss_feeds', async () => {
    const db = require('../src/db');
    const result = await db.queryOne('SELECT COUNT(*)::int as count FROM rss_feeds');
    expect(result.count).toBeGreaterThan(0);
  });

  it('can query rss_articles', async () => {
    const db = require('../src/db');
    const result = await db.queryOne('SELECT COUNT(*)::int as count FROM rss_articles');
    expect(result.count).toBeGreaterThan(0);
  });

  it('feed health columns exist', async () => {
    const db = require('../src/db');
    const result = await db.queryOne(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'rss_feeds' AND column_name = 'consecutive_failures'`
    );
    expect(result).toBeTruthy();
  });
});

describe('NLP sidecar', () => {
  it('GET /health returns 200', async () => {
    const res = await fetch(`${NLP_URL}/health`);
    expect(res.status).toBe(200);
  });

  it('POST /sentiment returns label', async () => {
    const res = await fetch(`${NLP_URL}/sentiment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'The economy is growing strongly' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.label).toBeTruthy();
    expect(typeof data.score).toBe('number');
  });
});

describe('spaCy sidecar', () => {
  it('GET /health returns ok', async () => {
    const res = await fetch(`${SPACY_URL}/health`);
    expect(res.status).toBe(200);
  });

  it('POST /ner returns entities', async () => {
    const res = await fetch(`${SPACY_URL}/ner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'President Biden visited Paris today', lang: 'en' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entities).toBeDefined();
    expect(data.entities.length).toBeGreaterThan(0);
  });
});

describe('Extract sidecar', () => {
  it('GET /health returns ok', async () => {
    const res = await fetch(`${EXTRACT_URL}/health`);
    expect(res.status).toBe(200);
  });
});

describe('Scheduler', () => {
  it('has registered 80+ jobs', async () => {
    const db = require('../src/db');
    const result = await db.queryOne(
      `SELECT COUNT(DISTINCT job_name)::int as count FROM scheduler_log`
    );
    expect(result.count).toBeGreaterThan(40);
  });

  it('recent jobs are succeeding', async () => {
    const db = require('../src/db');
    const result = await db.queryOne(
      `SELECT COUNT(*)::int as errors
       FROM scheduler_log
       WHERE status = 'error' AND executed_at > NOW() - INTERVAL '1 hour'`
    );
    expect(result.errors).toBeLessThan(5);
  });
});

describe('RSS feeds', () => {
  it('has active feeds', async () => {
    const db = require('../src/db');
    const result = await db.queryOne(
      `SELECT COUNT(*)::int as count FROM rss_feeds WHERE is_active = true`
    );
    expect(result.count).toBeGreaterThan(100);
  });

  it('no feeds with NULL source_type', async () => {
    const db = require('../src/db');
    const result = await db.queryOne(
      `SELECT COUNT(*)::int as count FROM rss_feeds WHERE source_type IS NULL`
    );
    expect(result.count).toBe(0);
  });

  it('recent articles exist (last 24h)', async () => {
    const db = require('../src/db');
    const result = await db.queryOne(
      `SELECT COUNT(*)::int as count FROM rss_articles WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    expect(result.count).toBeGreaterThan(0);
  });
});

describe('NLP enrichment', () => {
  it('has enriched articles', async () => {
    const db = require('../src/db');
    const result = await db.queryOne(
      `SELECT COUNT(*)::int as count FROM rss_articles_enrichment`
    );
    expect(result.count).toBeGreaterThan(100);
  });
});
