import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Evita conexion real a PostgreSQL
process.env.DB_HOST = '127.0.0.1';
const PG_PASS_KEY = 'POSTGRES_PASSWORD';
if (!process.env[PG_PASS_KEY]) process.env[PG_PASS_KEY] = 'x';

const require = createRequire(import.meta.url);

const db = require('../src/db.js');
const mockPoolQuery = vi.spyOn(db.pool, 'query');

const rss = require('../src/rss.js');

describe('SCORE_THRESHOLD', () => {
  it('exports a numeric threshold', () => {
    expect(typeof rss.SCORE_THRESHOLD).toBe('number');
    expect(rss.SCORE_THRESHOLD).toBe(8);
  });
});

describe('addKeyword()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts keyword with default weight 5', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 1, keyword: 'javascript', weight: 5 }], rowCount: 1 });
    const result = await rss.addKeyword('JavaScript');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO rss_keywords'),
      ['javascript', 5]
    );
    expect(result.keyword).toBe('javascript');
  });

  it('trims whitespace from keyword', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 2, keyword: 'react', weight: 5 }], rowCount: 1 });
    await rss.addKeyword('  react  ');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['react', 5]
    );
  });

  it('clamps weight to minimum 1', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 3, keyword: 'test', weight: 1 }], rowCount: 1 });
    await rss.addKeyword('test', -5);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['test', 1]
    );
  });

  it('clamps weight to maximum 10', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 4, keyword: 'test', weight: 10 }], rowCount: 1 });
    await rss.addKeyword('test', 99);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['test', 10]
    );
  });

  it('accepts custom weight within range', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 5, keyword: 'node', weight: 7 }], rowCount: 1 });
    await rss.addKeyword('node', 7);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['node', 7]
    );
  });
});

describe('getKeywords()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns keywords ordered by weight DESC', async () => {
    const keywords = [
      { id: 1, keyword: 'security', weight: 10 },
      { id: 2, keyword: 'javascript', weight: 5 },
    ];
    mockPoolQuery.mockResolvedValue({ rows: keywords, rowCount: 2 });
    const result = await rss.getKeywords();
    expect(result).toEqual(keywords);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY weight DESC'),
      undefined
    );
  });
});

describe('deleteKeyword()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes keyword by id and returns it', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 1, keyword: 'old' }], rowCount: 1 });
    const result = await rss.deleteKeyword(1);
    expect(result).toEqual({ id: 1, keyword: 'old' });
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM rss_keywords'),
      [1]
    );
  });

  it('returns null when keyword not found', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await rss.deleteKeyword(999);
    expect(result).toBeNull();
  });
});

describe('scoreArticle()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scores article using keywords from DB', async () => {
    mockPoolQuery.mockResolvedValue({
      rows: [{ keyword: 'javascript', weight: 5 }, { keyword: 'node', weight: 8 }],
      rowCount: 2,
    });
    const score = await rss.scoreArticle('JavaScript and Node.js', 'Great article');
    expect(score).toBe(13); // 5 + 8
  });

  it('returns 0 when no keywords in DB', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const score = await rss.scoreArticle('anything', 'here');
    expect(score).toBe(0);
  });
});

describe('addFeed()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('inserts feed with default category general', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 1, url: 'https://example.com/rss', name: 'Test', category: 'general' }], rowCount: 1 });
    const result = await rss.addFeed('https://example.com/rss', 'Test');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO rss_feeds'),
      ['https://example.com/rss', 'Test', 'general']
    );
    expect(result.category).toBe('general');
  });

  it('accepts custom category', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: 2, category: 'tech' }], rowCount: 1 });
    await rss.addFeed('https://tech.com/rss', 'Tech', 'tech');
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.any(String),
      ['https://tech.com/rss', 'Tech', 'tech']
    );
  });
});

describe('getFeeds()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns active feeds ordered by name', async () => {
    const feeds = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
    mockPoolQuery.mockResolvedValue({ rows: feeds, rowCount: 2 });
    const result = await rss.getFeeds();
    expect(result).toEqual(feeds);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('is_active = TRUE'),
      undefined
    );
  });
});

describe('getArticles()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns articles with default limit', async () => {
    const articles = [{ id: 1, title: 'Article A' }];
    mockPoolQuery.mockResolvedValue({ rows: articles, rowCount: 1 });
    const result = await rss.getArticles(null, 20);
    expect(result).toEqual(articles);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('LIMIT $1'),
      [20]
    );
  });

  it('filters by feed_id when provided', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await rss.getArticles(3, 10);
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining('feed_id = $2'),
      [10, 3]
    );
  });

  it('returns empty array when no articles', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const result = await rss.getArticles(null);
    expect(result).toEqual([]);
  });
});
