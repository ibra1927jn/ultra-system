import { describe, it, expect } from 'vitest';
import { calculateConversionRates as computeConversionRates } from '../src/utils/conversion_rates.js';

describe('Pipeline conversion rate calculations', () => {
  it('returns all zeros when no opportunities exist', () => {
    const rates = computeConversionRates({}, 0);
    expect(rates.new_to_contacted).toBe(0);
    expect(rates.contacted_to_applied).toBe(0);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('computes new_to_contacted correctly', () => {
    const rates = computeConversionRates({ new: 5, contacted: 3, applied: 1, won: 1 }, 10);
    // (3 + 1 + 1) / 10 * 100 = 50%
    expect(rates.new_to_contacted).toBe(50);
  });

  it('computes contacted_to_applied correctly', () => {
    const rates = computeConversionRates({ contacted: 4, applied: 3, won: 1 }, 10);
    // (3 + 1) / (4 + 3 + 1) * 100 = 50%
    expect(rates.contacted_to_applied).toBe(50);
  });

  it('computes applied_to_won correctly', () => {
    const rates = computeConversionRates({ applied: 2, rejected: 3, won: 1 }, 10);
    // 1 / (2 + 1 + 3) * 100 = 16.67 → rounds to 17
    expect(rates.applied_to_won).toBe(17);
  });

  it('computes overall_win_rate correctly', () => {
    const rates = computeConversionRates({ new: 3, contacted: 2, applied: 2, won: 3 }, 10);
    // 3 / 10 * 100 = 30%
    expect(rates.overall_win_rate).toBe(30);
  });

  it('handles 100% win rate', () => {
    const rates = computeConversionRates({ won: 5 }, 5);
    expect(rates.new_to_contacted).toBe(100);
    expect(rates.overall_win_rate).toBe(100);
    expect(rates.applied_to_won).toBe(100);
  });

  it('handles all rejected', () => {
    const rates = computeConversionRates({ rejected: 10 }, 10);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('handles only new opportunities (no progress)', () => {
    const rates = computeConversionRates({ new: 10 }, 10);
    expect(rates.new_to_contacted).toBe(0);
    expect(rates.contacted_to_applied).toBe(0);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('rounds correctly for fractional percentages', () => {
    const rates = computeConversionRates({ new: 1, contacted: 1, applied: 1 }, 3);
    // new_to_contacted: (1+1+0) / 3 * 100 = 66.67 → 67
    expect(rates.new_to_contacted).toBe(67);
  });
});
