import { describe, it, expect } from 'vitest';

/**
 * Pure pipeline conversion rate logic extracted from routes/opportunities.js lines 77-82.
 * Tests the conversion rate formulas independently of the database.
 */
function computeConversionRates(statusMap, totalCount) {
  const contacted = statusMap['contacted'] || 0;
  const applied = statusMap['applied'] || 0;
  const rejected = statusMap['rejected'] || 0;
  const won = statusMap['won'] || 0;

  return {
    new_to_contacted: totalCount > 0 ? Math.round((contacted + applied + won) / totalCount * 100) : 0,
    contacted_to_applied: (contacted + applied + won) > 0 ? Math.round((applied + won) / (contacted + applied + won) * 100) : 0,
    applied_to_won: (applied + won + rejected) > 0 ? Math.round(won / (applied + won + rejected) * 100) : 0,
    overall_win_rate: totalCount > 0 ? Math.round(won / totalCount * 100) : 0,
  };
}

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
