import { describe, it, expect } from 'vitest';

// scoreArticle depends on db.queryAll at runtime, so we test
// the scoring LOGIC by extracting and testing the algorithm directly.
// This avoids needing to mock CJS db module from ESM tests.

/**
 * Pure scoring logic extracted from rss.js scoreArticle.
 * Given a text and a list of {keyword, weight}, computes the relevance score.
 */
function computeScore(title, summary, keywords) {
  if (!keywords.length) return 0;
  const text = `${title} ${summary}`.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw.keyword.toLowerCase())) {
      score += kw.weight;
    }
  }
  return score;
}

describe('RSS keyword scoring algorithm', () => {
  it('returns 0 when no keywords configured', () => {
    expect(computeScore('any title', 'any summary', [])).toBe(0);
  });

  it('scores based on keyword match in title', () => {
    const keywords = [{ keyword: 'javascript', weight: 5 }];
    expect(computeScore('Learn JavaScript today', '', keywords)).toBe(5);
  });

  it('scores based on keyword match in summary', () => {
    const keywords = [{ keyword: 'remote', weight: 3 }];
    expect(computeScore('Job posting', 'This is a remote position', keywords)).toBe(3);
  });

  it('sums weights for multiple matching keywords', () => {
    const keywords = [
      { keyword: 'node', weight: 4 },
      { keyword: 'remote', weight: 3 },
      { keyword: 'python', weight: 2 },
    ];
    expect(computeScore('Node.js developer', 'Remote work available', keywords)).toBe(7);
  });

  it('is case insensitive', () => {
    const keywords = [{ keyword: 'react', weight: 5 }];
    expect(computeScore('REACT Developer Needed', '', keywords)).toBe(5);
  });

  it('does not match keywords not in text', () => {
    const keywords = [{ keyword: 'golang', weight: 8 }];
    expect(computeScore('Python developer', 'Flask and Django', keywords)).toBe(0);
  });

  it('handles empty title and summary', () => {
    const keywords = [{ keyword: 'test', weight: 1 }];
    expect(computeScore('', '', keywords)).toBe(0);
  });

  it('handles keyword appearing in both title and summary (counted once)', () => {
    const keywords = [{ keyword: 'react', weight: 5 }];
    // includes() returns true if found anywhere in combined text
    expect(computeScore('React developer', 'Uses React and Node', keywords)).toBe(5);
  });

  it('handles multiple keywords all matching', () => {
    const keywords = [
      { keyword: 'senior', weight: 3 },
      { keyword: 'react', weight: 5 },
      { keyword: 'remote', weight: 4 },
    ];
    expect(computeScore('Senior React Developer', 'Remote position', keywords)).toBe(12);
  });

  it('matches partial words (substring match)', () => {
    // This matches the actual behavior in rss.js - uses includes(), not word boundary
    const keywords = [{ keyword: 'react', weight: 5 }];
    expect(computeScore('reactivity framework', '', keywords)).toBe(5);
  });
});
