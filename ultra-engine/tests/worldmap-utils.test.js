// Unit tests for public/worldmap-utils.js — pure functions, no DOM.

import { describe, it, expect } from 'vitest';

const U = require('../public/worldmap-utils.js');

describe('escHtml', () => {
  it('escapes XSS-relevant characters', () => {
    expect(U.escHtml('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(U.escHtml("it's")).toBe('it&#39;s');
    expect(U.escHtml('a & b')).toBe('a &amp; b');
  });
  it('handles null/undefined/non-string', () => {
    expect(U.escHtml(null)).toBe('');
    expect(U.escHtml(undefined)).toBe('');
    expect(U.escHtml(123)).toBe('123');
    expect(U.escHtml('')).toBe('');
  });
});

describe('isoToFlag', () => {
  it('converts ISO2 to flag emoji', () => {
    expect(U.isoToFlag('US')).toBe('🇺🇸');
    expect(U.isoToFlag('FR')).toBe('🇫🇷');
    expect(U.isoToFlag('ES')).toBe('🇪🇸');
    expect(U.isoToFlag('dz')).toBe('🇩🇿');  // case-insensitive
  });
  it('returns empty for invalid input', () => {
    expect(U.isoToFlag('')).toBe('');
    expect(U.isoToFlag('USA')).toBe('');
    expect(U.isoToFlag(null)).toBe('');
    expect(U.isoToFlag(undefined)).toBe('');
  });
});

describe('getTimeAgo', () => {
  const NOW = new Date('2026-04-14T12:00:00Z').getTime();
  it('formats past times correctly', () => {
    expect(U.getTimeAgo('2026-04-14T11:59:30Z', NOW)).toBe('just now');       // 30s
    expect(U.getTimeAgo('2026-04-14T11:55:00Z', NOW)).toBe('5m ago');         // 5m
    expect(U.getTimeAgo('2026-04-14T09:00:00Z', NOW)).toBe('3h ago');         // 3h
    expect(U.getTimeAgo('2026-04-12T12:00:00Z', NOW)).toBe('2d ago');         // 2d
  });
  it('handles invalid/empty input', () => {
    expect(U.getTimeAgo(null, NOW)).toBe('');
    expect(U.getTimeAgo('', NOW)).toBe('');
    expect(U.getTimeAgo('not-a-date', NOW)).toBe('');
  });
  it('handles future dates gracefully', () => {
    expect(U.getTimeAgo('2026-04-14T13:00:00Z', NOW)).toBe('just now');  // 1h future
  });
});

describe('fmtPrice', () => {
  it('formats different magnitudes', () => {
    expect(U.fmtPrice(0.1234)).toBe('0.1234');
    expect(U.fmtPrice(5.678)).toBe('5.68');
    expect(U.fmtPrice(123.45)).toBe('123.45');
    expect(U.fmtPrice(12345)).toMatch(/12,345/);
  });
  it('handles invalid input', () => {
    expect(U.fmtPrice('not-a-number')).toBe('0');
    expect(U.fmtPrice(null)).toBe('0');
    expect(U.fmtPrice(undefined)).toBe('0');
  });
});

describe('fmtVol', () => {
  it('formats volumes with unit suffixes', () => {
    expect(U.fmtVol(500)).toBe('$500');
    expect(U.fmtVol(1500)).toBe('$2K');  // rounds to nearest K
    expect(U.fmtVol(1500000)).toBe('$1.5M');
    expect(U.fmtVol(2500000000)).toBe('$2.5B');
  });
  it('handles invalid/zero', () => {
    expect(U.fmtVol(0)).toBe('$0');
    expect(U.fmtVol(-5)).toBe('$0');
    expect(U.fmtVol('bad')).toBe('$0');
  });
});

describe('fuzzyMatch', () => {
  it('exact substring matches get high score', () => {
    expect(U.fuzzyMatch('france', 'France news today')).toBeGreaterThan(0);
    expect(U.fuzzyMatch('ukraine', 'ukraine drone strike')).toBeGreaterThan(0);
  });
  it('substring at start scores higher than middle', () => {
    const startMatch = U.fuzzyMatch('ukr', 'ukraine war');
    const endMatch = U.fuzzyMatch('ukr', 'news about ukraine');
    expect(startMatch).toBeGreaterThan(endMatch);
  });
  it('fuzzy-matches scattered characters', () => {
    expect(U.fuzzyMatch('usa', 'United States Army')).toBeGreaterThan(0);
  });
  it('zero for no match', () => {
    expect(U.fuzzyMatch('xyz', 'france')).toBe(0);
  });
  it('empty query returns 1', () => {
    expect(U.fuzzyMatch('', 'anything')).toBe(1);
  });
});

describe('sortArticles', () => {
  const articles = [
    { id: 1, relevance_score: 5, sentiment_label: 'negative', published_at: '2026-04-14T10:00:00Z' },
    { id: 2, relevance_score: 9, sentiment_label: 'positive', published_at: '2026-04-14T08:00:00Z' },
    { id: 3, relevance_score: 7, sentiment_label: 'neutral',  published_at: '2026-04-14T12:00:00Z' },
  ];
  it('sorts by date (newest first) by default', () => {
    const sorted = U.sortArticles(articles, 'date');
    expect(sorted.map(a => a.id)).toEqual([3, 1, 2]);
  });
  it('sorts by relevance (highest first)', () => {
    const sorted = U.sortArticles(articles, 'relevance');
    expect(sorted.map(a => a.id)).toEqual([2, 3, 1]);
  });
  it('sorts by sentiment (negative first)', () => {
    const sorted = U.sortArticles(articles, 'sentiment');
    expect(sorted.map(a => a.id)).toEqual([1, 3, 2]);
  });
  it('does not mutate input array', () => {
    const original = articles.map(a => a.id);
    U.sortArticles(articles, 'relevance');
    expect(articles.map(a => a.id)).toEqual(original);
  });
});
