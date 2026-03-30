import { describe, it, expect } from 'vitest';
import { computeArticleScore } from '../src/utils/rss_scoring.js';

describe('computeArticleScore()', () => {
  const keywords = [
    { keyword: 'javascript', weight: 5 },
    { keyword: 'node.js', weight: 8 },
    { keyword: 'react', weight: 3 },
    { keyword: 'security', weight: 7 },
  ];

  it('returns 0 when no keywords provided', () => {
    expect(computeArticleScore('hello', 'world', [])).toBe(0);
    expect(computeArticleScore('hello', 'world', null)).toBe(0);
    expect(computeArticleScore('hello', 'world', undefined)).toBe(0);
  });

  it('returns 0 when no keywords match', () => {
    expect(computeArticleScore('python tutorial', 'learn django', keywords)).toBe(0);
  });

  it('matches keyword in title', () => {
    expect(computeArticleScore('JavaScript frameworks', '', keywords)).toBe(5);
  });

  it('matches keyword in summary', () => {
    expect(computeArticleScore('', 'A guide to security best practices', keywords)).toBe(7);
  });

  it('matches keyword across title and summary combined', () => {
    expect(computeArticleScore('New release', 'node.js 22 is out', keywords)).toBe(8);
  });

  it('sums weights for multiple matching keywords', () => {
    const score = computeArticleScore(
      'JavaScript and Node.js',
      'Build secure React apps with security best practices',
      keywords
    );
    expect(score).toBe(5 + 8 + 3 + 7); // all four match
  });

  it('is case-insensitive', () => {
    expect(computeArticleScore('JAVASCRIPT', '', keywords)).toBe(5);
    expect(computeArticleScore('Node.JS', '', keywords)).toBe(8);
    expect(computeArticleScore('REACT', '', keywords)).toBe(3);
  });

  it('handles null/undefined title and summary', () => {
    expect(computeArticleScore(null, null, keywords)).toBe(0);
    expect(computeArticleScore(undefined, undefined, keywords)).toBe(0);
    expect(computeArticleScore(null, 'javascript', keywords)).toBe(5);
    expect(computeArticleScore('react', null, keywords)).toBe(3);
  });

  it('handles empty strings', () => {
    expect(computeArticleScore('', '', keywords)).toBe(0);
  });

  it('matches substring occurrences', () => {
    // "javascript" is a substring of "javascriptframework"
    expect(computeArticleScore('javascriptframework', '', keywords)).toBe(5);
  });

  it('handles single keyword list', () => {
    const single = [{ keyword: 'ai', weight: 10 }];
    expect(computeArticleScore('AI revolution', '', single)).toBe(10);
    expect(computeArticleScore('nothing here', '', single)).toBe(0);
  });

  it('handles keywords with special characters', () => {
    const special = [{ keyword: 'c++', weight: 4 }];
    expect(computeArticleScore('Learn C++ today', '', special)).toBe(4);
  });

  it('does not double-count keyword appearing in both title and summary', () => {
    // The function concatenates title + summary, so a keyword appearing in both
    // only matches once in the includes() check
    expect(computeArticleScore('javascript', 'javascript again', keywords)).toBe(5);
  });

  it('handles high-weight keywords correctly', () => {
    const heavy = [
      { keyword: 'critical', weight: 100 },
      { keyword: 'urgent', weight: 50 },
    ];
    expect(computeArticleScore('critical urgent alert', '', heavy)).toBe(150);
  });
});
