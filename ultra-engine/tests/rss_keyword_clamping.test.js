import { describe, it, expect } from 'vitest';

/**
 * Tests for the keyword weight clamping logic used in rss.js addKeyword.
 * Extracted as pure function to test without DB.
 */
function clampWeight(weight) {
  return Math.min(10, Math.max(1, parseInt(weight)));
}

function normalizeKeyword(keyword) {
  return keyword.toLowerCase().trim();
}

describe('RSS keyword weight clamping', () => {
  it('accepts valid weight in range', () => {
    expect(clampWeight(5)).toBe(5);
    expect(clampWeight(1)).toBe(1);
    expect(clampWeight(10)).toBe(10);
  });

  it('clamps weight below 1 to 1', () => {
    expect(clampWeight(0)).toBe(1);
    expect(clampWeight(-5)).toBe(1);
  });

  it('clamps weight above 10 to 10', () => {
    expect(clampWeight(15)).toBe(10);
    expect(clampWeight(100)).toBe(10);
  });

  it('parses string weights', () => {
    expect(clampWeight('7')).toBe(7);
    expect(clampWeight('3.9')).toBe(3);
  });

  it('returns NaN for non-numeric input', () => {
    expect(clampWeight('abc')).toBeNaN();
  });
});

describe('RSS keyword normalization', () => {
  it('lowercases keyword', () => {
    expect(normalizeKeyword('React')).toBe('react');
    expect(normalizeKeyword('NODE')).toBe('node');
  });

  it('trims whitespace', () => {
    expect(normalizeKeyword('  docker  ')).toBe('docker');
    expect(normalizeKeyword('\ttypescript\n')).toBe('typescript');
  });

  it('lowercases and trims together', () => {
    expect(normalizeKeyword('  FastAPI ')).toBe('fastapi');
  });
});
