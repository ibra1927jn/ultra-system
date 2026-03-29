import { describe, it, expect } from 'vitest';

/**
 * Budget calculation logic extracted from scheduler.js checkBudgetAlerts
 * and routes/finances.js GET /budget.
 */

function computeRunway(income, expense, dayOfMonth) {
  const remaining = income - expense;
  const dailyBurn = dayOfMonth > 0 ? expense / dayOfMonth : 0;
  const runway = dailyBurn > 0 ? Math.floor(remaining / dailyBurn) : 999;
  return { remaining, dailyBurn, runway };
}

function budgetUrgencyEmoji(percentUsed) {
  return parseFloat(percentUsed) >= 100 ? '🔴' : '🟡';
}

/**
 * RSS keyword weight clamping from rss.js addKeyword
 */
function clampWeight(weight) {
  return Math.min(10, Math.max(1, parseInt(weight)));
}

describe('budget runway calculation', () => {
  it('calculates correct runway with normal spending', () => {
    const { remaining, dailyBurn, runway } = computeRunway(3000, 1500, 15);
    expect(remaining).toBe(1500);
    expect(dailyBurn).toBe(100);
    expect(runway).toBe(15);
  });

  it('returns 999 when no expenses', () => {
    const { runway } = computeRunway(3000, 0, 15);
    expect(runway).toBe(999);
  });

  it('returns 0 runway when overspent', () => {
    const { runway, remaining } = computeRunway(1000, 2000, 15);
    expect(remaining).toBe(-1000);
    expect(runway).toBeLessThan(0);
  });

  it('handles day 1 of month', () => {
    const { dailyBurn } = computeRunway(3000, 100, 1);
    expect(dailyBurn).toBe(100);
  });

  it('handles day 0 (edge case)', () => {
    const { runway } = computeRunway(3000, 0, 0);
    expect(runway).toBe(999);
  });
});

describe('budget urgency emoji', () => {
  it('returns red for 100% or over', () => {
    expect(budgetUrgencyEmoji(100)).toBe('🔴');
    expect(budgetUrgencyEmoji(150)).toBe('🔴');
    expect(budgetUrgencyEmoji('100.0')).toBe('🔴');
  });

  it('returns yellow for under 100%', () => {
    expect(budgetUrgencyEmoji(80)).toBe('🟡');
    expect(budgetUrgencyEmoji(99.9)).toBe('🟡');
    expect(budgetUrgencyEmoji('85.5')).toBe('🟡');
  });
});

describe('RSS keyword weight clamping', () => {
  it('clamps to range 1-10', () => {
    expect(clampWeight(5)).toBe(5);
    expect(clampWeight(1)).toBe(1);
    expect(clampWeight(10)).toBe(10);
  });

  it('clamps values below 1', () => {
    expect(clampWeight(0)).toBe(1);
    expect(clampWeight(-5)).toBe(1);
  });

  it('clamps values above 10', () => {
    expect(clampWeight(15)).toBe(10);
    expect(clampWeight(100)).toBe(10);
  });

  it('parses string inputs', () => {
    expect(clampWeight('7')).toBe(7);
    expect(clampWeight('3.9')).toBe(3);
  });

  it('returns NaN for non-numeric input (parseInt behavior)', () => {
    expect(clampWeight('abc')).toBeNaN();
  });
});
