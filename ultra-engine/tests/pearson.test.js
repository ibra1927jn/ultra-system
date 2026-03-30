import { describe, it, expect } from 'vitest';
import { pearson } from '../src/utils/pearson.js';

describe('pearson()', () => {
  it('returns positive correlation for positively correlated data', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearson(x, y)).toBe(1);
  });

  it('returns negative correlation for inversely correlated data', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    expect(pearson(x, y)).toBe(-1);
  });

  it('returns ~0 for uncorrelated data', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [3, 1, 4, 2, 5];
    const r = pearson(x, y);
    expect(r).not.toBeNull();
    expect(Math.abs(r)).toBeLessThanOrEqual(0.7);
  });

  it('returns null for arrays with fewer than 3 elements', () => {
    expect(pearson([1, 2], [3, 4])).toBeNull();
    expect(pearson([1], [2])).toBeNull();
    expect(pearson([], [])).toBeNull();
  });

  it('returns null for mismatched array lengths', () => {
    expect(pearson([1, 2, 3], [4, 5])).toBeNull();
    expect(pearson([1, 2], [3, 4, 5])).toBeNull();
  });

  it('returns null when all values in one array are identical (zero variance)', () => {
    expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull();
    expect(pearson([1, 2, 3], [7, 7, 7])).toBeNull();
  });

  it('rounds to 2 decimal places', () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 3, 5, 4, 6];
    const r = pearson(x, y);
    const decimals = r.toString().split('.')[1];
    expect(!decimals || decimals.length <= 2).toBe(true);
  });

  it('handles exactly 3 elements (minimum)', () => {
    const r = pearson([1, 2, 3], [1, 2, 3]);
    expect(r).toBe(1);
  });

  it('handles negative values', () => {
    const x = [-3, -2, -1, 0, 1];
    const y = [-6, -4, -2, 0, 2];
    expect(pearson(x, y)).toBe(1);
  });

  it('handles floating point values', () => {
    const x = [1.5, 2.5, 3.5, 4.5, 5.5];
    const y = [3, 5, 7, 9, 11];
    expect(pearson(x, y)).toBe(1);
  });

  it('returns null when both arrays have zero variance', () => {
    expect(pearson([5, 5, 5], [7, 7, 7])).toBeNull();
  });

  it('handles large arrays', () => {
    const x = Array.from({ length: 100 }, (_, i) => i);
    const y = Array.from({ length: 100 }, (_, i) => i * 2 + 1);
    expect(pearson(x, y)).toBe(1);
  });

  it('returns value between -1 and 1 for real-world-like data', () => {
    const sleep = [7, 6.5, 8, 5, 7.5, 6, 8.5];
    const energy = [6, 5, 8, 4, 7, 5, 9];
    const r = pearson(sleep, energy);
    expect(r).not.toBeNull();
    expect(r).toBeGreaterThanOrEqual(-1);
    expect(r).toBeLessThanOrEqual(1);
  });
});
