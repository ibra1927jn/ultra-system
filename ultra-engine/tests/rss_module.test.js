import { describe, it, expect, vi } from 'vitest';

// Mock dependencies
vi.mock('rss-parser', () => {
  return {
    default: vi.fn(() => ({
      parseURL: vi.fn(),
    })),
  };
});

vi.mock('../src/db.js', () => ({
  default: { query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn() },
  query: vi.fn(),
  queryOne: vi.fn(),
  queryAll: vi.fn(),
}));

const { SCORE_THRESHOLD } = await import('../src/rss.js');

describe('rss module exports', () => {
  it('exports SCORE_THRESHOLD as a number', () => {
    expect(typeof SCORE_THRESHOLD).toBe('number');
  });

  it('SCORE_THRESHOLD is 8', () => {
    expect(SCORE_THRESHOLD).toBe(8);
  });

  it('SCORE_THRESHOLD is reasonable (between 1 and 20)', () => {
    expect(SCORE_THRESHOLD).toBeGreaterThanOrEqual(1);
    expect(SCORE_THRESHOLD).toBeLessThanOrEqual(20);
  });
});

describe('rss module function exports', () => {
  it('exports expected functions', async () => {
    const rss = await import('../src/rss.js');
    expect(typeof rss.addFeed).toBe('function');
    expect(typeof rss.getFeeds).toBe('function');
    expect(typeof rss.fetchFeed).toBe('function');
    expect(typeof rss.fetchAll).toBe('function');
    expect(typeof rss.getArticles).toBe('function');
    expect(typeof rss.addKeyword).toBe('function');
    expect(typeof rss.getKeywords).toBe('function');
    expect(typeof rss.deleteKeyword).toBe('function');
    expect(typeof rss.scoreArticle).toBe('function');
  });
});
