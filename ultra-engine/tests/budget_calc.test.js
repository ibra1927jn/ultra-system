import { describe, it, expect } from 'vitest';
import { calculateRunway, BUDGET_ALERTS_SQL } from '../src/utils/budget_calc.js';

describe('calculateRunway()', () => {
  it('calculates remaining balance', () => {
    const { remaining } = calculateRunway(5000, 3000, 15);
    expect(remaining).toBe(2000);
  });

  it('calculates daily burn rate', () => {
    const { dailyBurn } = calculateRunway(5000, 3000, 15);
    expect(dailyBurn).toBe(200); // 3000 / 15
  });

  it('calculates runway in days', () => {
    const { runway } = calculateRunway(5000, 3000, 15);
    expect(runway).toBe(10); // 2000 / 200
  });

  it('returns 999 runway when no expenses and positive income', () => {
    const { runway } = calculateRunway(5000, 0, 15);
    expect(runway).toBe(999);
  });

  it('returns 0 runway when no income and no expenses', () => {
    const { runway } = calculateRunway(0, 0, 15);
    expect(runway).toBe(0);
  });

  it('handles negative remaining (overspent)', () => {
    const { remaining, runway } = calculateRunway(1000, 3000, 15);
    expect(remaining).toBe(-2000);
    expect(runway).toBe(-10); // already overspent
  });

  it('handles dayOfMonth = 0 (edge case)', () => {
    const { dailyBurn, runway } = calculateRunway(5000, 3000, 0);
    expect(dailyBurn).toBe(0);
    expect(runway).toBe(999); // remaining > 0, no burn
  });

  it('handles first day of month', () => {
    const { dailyBurn } = calculateRunway(5000, 100, 1);
    expect(dailyBurn).toBe(100);
  });

  it('handles expenses exceeding income with zero burn', () => {
    const { runway } = calculateRunway(0, 0, 0);
    expect(runway).toBe(0); // remaining = 0, not > 0
  });
});

describe('BUDGET_ALERTS_SQL', () => {
  it('is a valid SQL string with expected structure', () => {
    expect(typeof BUDGET_ALERTS_SQL).toBe('string');
    expect(BUDGET_ALERTS_SQL).toContain('SELECT');
    expect(BUDGET_ALERTS_SQL).toContain('FROM budgets');
    expect(BUDGET_ALERTS_SQL).toContain('JOIN finances');
    expect(BUDGET_ALERTS_SQL).toContain('GROUP BY');
    expect(BUDGET_ALERTS_SQL).toContain('HAVING');
  });

  it('uses parameterized query for month ($1)', () => {
    expect(BUDGET_ALERTS_SQL).toContain('$1');
  });

  it('filters categories at 80% threshold', () => {
    expect(BUDGET_ALERTS_SQL).toContain('0.8');
  });

  it('selects expected columns', () => {
    expect(BUDGET_ALERTS_SQL).toContain('category');
    expect(BUDGET_ALERTS_SQL).toContain('monthly_limit');
    expect(BUDGET_ALERTS_SQL).toContain('spent');
    expect(BUDGET_ALERTS_SQL).toContain('percent_used');
  });
});
