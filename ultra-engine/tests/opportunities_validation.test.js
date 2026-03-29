import { describe, it, expect } from 'vitest';

/**
 * Status validation logic extracted from routes/opportunities.js POST handler.
 * Tests the validation without requiring Express or DB.
 */
const validStatuses = ['new', 'contacted', 'applied', 'rejected', 'won'];

function validateStatus(status) {
  return validStatuses.includes(status) ? status : 'new';
}

/**
 * Pipeline conversion rate logic extracted from routes/opportunities.js GET /pipeline.
 */
function computeConversionRates(statusMap) {
  const totalCount = Object.values(statusMap).reduce((a, b) => a + b, 0);
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

describe('opportunity status validation', () => {
  it('accepts valid statuses', () => {
    for (const s of validStatuses) {
      expect(validateStatus(s)).toBe(s);
    }
  });

  it('defaults to "new" for invalid status', () => {
    expect(validateStatus('invalid')).toBe('new');
    expect(validateStatus('')).toBe('new');
    expect(validateStatus(undefined)).toBe('new');
    expect(validateStatus(null)).toBe('new');
  });

  it('does not accept status with different casing', () => {
    expect(validateStatus('New')).toBe('new');
    expect(validateStatus('CONTACTED')).toBe('new');
  });
});

describe('pipeline conversion rates', () => {
  it('returns all zeros for empty pipeline', () => {
    const rates = computeConversionRates({});
    expect(rates.new_to_contacted).toBe(0);
    expect(rates.contacted_to_applied).toBe(0);
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('calculates correct rates for basic pipeline', () => {
    const rates = computeConversionRates({
      new: 10,
      contacted: 5,
      applied: 3,
      rejected: 1,
      won: 1,
    });
    // new_to_contacted = (5+3+1)/20 = 45%
    expect(rates.new_to_contacted).toBe(45);
    // contacted_to_applied = (3+1)/(5+3+1) = 44%
    expect(rates.contacted_to_applied).toBe(44);
    // applied_to_won = 1/(3+1+1) = 20%
    expect(rates.applied_to_won).toBe(20);
    // overall = 1/20 = 5%
    expect(rates.overall_win_rate).toBe(5);
  });

  it('handles 100% win rate', () => {
    const rates = computeConversionRates({ won: 5 });
    expect(rates.overall_win_rate).toBe(100);
    expect(rates.new_to_contacted).toBe(100);
  });

  it('handles all rejected', () => {
    const rates = computeConversionRates({ new: 5, rejected: 5 });
    expect(rates.applied_to_won).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });

  it('handles only new items', () => {
    const rates = computeConversionRates({ new: 10 });
    expect(rates.new_to_contacted).toBe(0);
    expect(rates.overall_win_rate).toBe(0);
  });
});
