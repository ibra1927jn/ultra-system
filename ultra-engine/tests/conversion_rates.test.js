import { describe, it, expect } from 'vitest';
import { calculateConversionRates } from '../src/utils/conversion_rates.js';

describe('calculateConversionRates()', () => {
  it('calculates all rates for typical pipeline', () => {
    const rates = calculateConversionRates(
      { contacted: 5, applied: 3, rejected: 2, won: 1 },
      20
    );
    expect(rates.new_to_contacted).toBe(45);  // (5+3+1)/20 * 100
    expect(rates.contacted_to_applied).toBe(44);  // (3+1)/(5+3+1) * 100
    expect(rates.applied_to_won).toBe(17);  // 1/(3+1+2) * 100
    expect(rates.overall_win_rate).toBe(5);  // 1/20 * 100
  });

  it('returns zeros when totalCount is 0', () => {
    const rates = calculateConversionRates({}, 0);
    expect(rates.new_to_contacted).toBe(0);
    expect(rates.contacted_to_applied).toBe(0);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('handles all-new pipeline (no progress)', () => {
    const rates = calculateConversionRates({ new: 10 }, 10);
    expect(rates.new_to_contacted).toBe(0);
    expect(rates.contacted_to_applied).toBe(0);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('handles 100% win rate', () => {
    const rates = calculateConversionRates({ won: 5 }, 5);
    expect(rates.new_to_contacted).toBe(100);
    expect(rates.contacted_to_applied).toBe(100);
    expect(rates.applied_to_won).toBe(100);
    expect(rates.overall_win_rate).toBe(100);
  });

  it('handles pipeline with only rejections', () => {
    const rates = calculateConversionRates({ rejected: 10 }, 10);
    expect(rates.new_to_contacted).toBe(0);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('handles missing status keys gracefully', () => {
    const rates = calculateConversionRates({ contacted: 3 }, 10);
    expect(rates.new_to_contacted).toBe(30);
    expect(rates.contacted_to_applied).toBe(0);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('rounds to nearest integer', () => {
    const rates = calculateConversionRates(
      { contacted: 1, applied: 1, won: 1 },
      3
    );
    expect(rates.new_to_contacted).toBe(100);
    expect(rates.contacted_to_applied).toBe(67); // 2/3 * 100
    expect(rates.applied_to_won).toBe(50);  // 1/2 * 100
    expect(rates.overall_win_rate).toBe(33); // 1/3 * 100
  });

  it('handles large numbers', () => {
    const rates = calculateConversionRates(
      { contacted: 500, applied: 200, rejected: 100, won: 50 },
      1000
    );
    expect(rates.new_to_contacted).toBe(75);
    expect(rates.applied_to_won).toBe(14); // 50/350 * 100
    expect(rates.overall_win_rate).toBe(5);
  });
});
