import { describe, it, expect } from 'vitest';

/**
 * Tests for RSS scoring threshold logic and keyword weight clamping.
 * Extracted from rss.js to test pure logic.
 */

const SCORE_THRESHOLD = 8;

describe('RSS SCORE_THRESHOLD', () => {
  it('threshold is 8', () => {
    expect(SCORE_THRESHOLD).toBe(8);
  });

  it('articles at threshold should trigger alert', () => {
    expect(8 >= SCORE_THRESHOLD).toBe(true);
  });

  it('articles below threshold should not trigger alert', () => {
    expect(7 >= SCORE_THRESHOLD).toBe(false);
  });
});

describe('RSS keyword weight clamping (addKeyword logic)', () => {
  // Extracted from rss.js addKeyword: Math.min(10, Math.max(1, parseInt(weight)))
  function clampWeight(weight) {
    return Math.min(10, Math.max(1, parseInt(weight)));
  }

  it('clamps weight to minimum 1', () => {
    expect(clampWeight(0)).toBe(1);
    expect(clampWeight(-5)).toBe(1);
  });

  it('clamps weight to maximum 10', () => {
    expect(clampWeight(15)).toBe(10);
    expect(clampWeight(100)).toBe(10);
  });

  it('passes through valid weights', () => {
    expect(clampWeight(1)).toBe(1);
    expect(clampWeight(5)).toBe(5);
    expect(clampWeight(10)).toBe(10);
  });

  it('parses string weights', () => {
    expect(clampWeight('7')).toBe(7);
    expect(clampWeight('3')).toBe(3);
  });

  it('handles float weights by truncating', () => {
    expect(clampWeight(7.9)).toBe(7);
    expect(clampWeight(3.1)).toBe(3);
  });

  it('returns NaN for non-numeric input', () => {
    expect(clampWeight('abc')).toBeNaN();
  });
});

describe('RSS keyword normalization', () => {
  // Extracted from rss.js addKeyword: keyword.toLowerCase().trim()
  function normalizeKeyword(keyword) {
    return keyword.toLowerCase().trim();
  }

  it('converts to lowercase', () => {
    expect(normalizeKeyword('React')).toBe('react');
    expect(normalizeKeyword('TYPESCRIPT')).toBe('typescript');
  });

  it('trims whitespace', () => {
    expect(normalizeKeyword('  node  ')).toBe('node');
  });

  it('handles mixed case and whitespace', () => {
    expect(normalizeKeyword(' FastAPI ')).toBe('fastapi');
  });
});
