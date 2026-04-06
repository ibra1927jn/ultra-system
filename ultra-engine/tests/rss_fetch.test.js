import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

// Evita conexion real a PostgreSQL
process.env.DB_HOST = '127.0.0.1';
const PG_PASS_KEY = 'POSTGRES_PASSWORD';
if (!process.env[PG_PASS_KEY]) process.env[PG_PASS_KEY] = 'x';

const require = createRequire(import.meta.url);

const db = require('../src/db.js');
const mockPoolQuery = vi.spyOn(db.pool, 'query');

// Mock telegram sendAlert
const telegram = require('../src/telegram.js');
vi.spyOn(telegram, 'sendAlert').mockResolvedValue();
vi.spyOn(telegram, 'logNotification').mockResolvedValue();

// Necesitamos interceptar rss-parser. Como rss.js usa CJS require,
// parcheamos el parser despues de cargar el modulo.
const rss = require('../src/rss.js');

// Parcheamos el modulo rss-parser reemplazando parseURL en el proto
const Parser = require('rss-parser');
const mockParseURL = vi.fn();
vi.spyOn(Parser.prototype, 'parseURL').mockImplementation(mockParseURL);

describe('fetchFeed()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws when feed not found', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(rss.fetchFeed(999)).rejects.toThrow('Feed 999 no encontrado');
  });

  it('fetches and inserts articles with scoring', async () => {
    // queryOne(SELECT feed): returns feed
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, url: 'https://example.com/rss', name: 'Test Feed' }],
      rowCount: 1,
    });
    // queryAll(SELECT keywords): returns keywords
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ keyword: 'javascript', weight: 10 }],
      rowCount: 1,
    });

    mockParseURL.mockResolvedValue({
      items: [
        { title: 'JavaScript Update', contentSnippet: 'New JS features', link: 'https://example.com/1', pubDate: '2026-04-01' },
        { title: 'Python News', contentSnippet: 'Python 4.0', link: 'https://example.com/2', pubDate: '2026-04-01' },
      ],
    });

    // query(INSERT article 1)
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // query(INSERT article 2)
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
    // query(UPDATE feed timestamp)
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await rss.fetchFeed(1);
    expect(result.newCount).toBe(2);
    expect(result.highScoreArticles.length).toBe(1);
    expect(result.highScoreArticles[0].title).toBe('JavaScript Update');
    expect(result.highScoreArticles[0].score).toBe(10);
  });

  it('returns zero when parser fails', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, url: 'https://bad.com/rss', name: 'Bad Feed' }],
      rowCount: 1,
    });
    mockParseURL.mockRejectedValue(new Error('Network error'));

    const result = await rss.fetchFeed(1);
    expect(result.newCount).toBe(0);
    expect(result.highScoreArticles).toEqual([]);
  });

  it('handles articles without pubDate', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, url: 'https://example.com/rss', name: 'Feed' }],
      rowCount: 1,
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no keywords

    mockParseURL.mockResolvedValue({
      items: [{ title: 'No Date Article', link: 'https://example.com/3' }],
    });

    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    const result = await rss.fetchFeed(1);
    expect(result.newCount).toBe(1);
  });

  it('skips duplicate articles (rowCount 0)', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, url: 'https://example.com/rss', name: 'Feed' }],
      rowCount: 1,
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no keywords

    mockParseURL.mockResolvedValue({
      items: [{ title: 'Dup', link: 'https://example.com/dup' }],
    });

    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ON CONFLICT
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    const result = await rss.fetchFeed(1);
    expect(result.newCount).toBe(0);
    expect(result.highScoreArticles).toEqual([]);
  });

  it('truncates long content to 500 chars', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, url: 'https://example.com/rss', name: 'Feed' }],
      rowCount: 1,
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // no keywords

    const longContent = 'x'.repeat(1000);
    mockParseURL.mockResolvedValue({
      items: [{ title: 'Long', content: longContent, link: 'https://example.com/long' }],
    });

    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    const result = await rss.fetchFeed(1);
    expect(result.newCount).toBe(1);
    // INSERT call — 3rd param index [3] is summary (after feedId, title, url)
    const insertCall = mockPoolQuery.mock.calls.find(c => c[0].includes('INSERT INTO rss_articles'));
    expect(insertCall[1][3].length).toBe(500);
  });
});

describe('fetchAll()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns zeros when no active feeds', async () => {
    // getFeeds -> queryAll
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const result = await rss.fetchAll();
    expect(result.totalNew).toBe(0);
    expect(result.highScoreArticles).toEqual([]);
  });

  it('aggregates results from active feeds', async () => {
    // getFeeds
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Feed A', url: 'https://a.com/rss' }],
      rowCount: 1,
    });
    // fetchFeed(1): queryOne for feed
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ id: 1, url: 'https://a.com/rss', name: 'Feed A' }],
      rowCount: 1,
    });
    // queryAll for keywords
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    mockParseURL.mockResolvedValueOnce({
      items: [{ title: 'A1', link: 'https://a.com/1' }],
    });

    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // INSERT
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

    const result = await rss.fetchAll();
    expect(result.totalNew).toBe(1);
  });
});

describe('scoreArticle()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('scores using keywords from DB', async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ keyword: 'node', weight: 8 }],
      rowCount: 1,
    });
    const score = await rss.scoreArticle('Node.js update', '');
    expect(score).toBe(8);
  });

  it('returns 0 when no keywords in DB', async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    const score = await rss.scoreArticle('anything', 'here');
    expect(score).toBe(0);
  });
});
