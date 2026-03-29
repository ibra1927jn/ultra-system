import { describe, it, expect } from 'vitest';

/**
 * Pure runway/burn rate logic extracted from routes/finances.js lines 129-136.
 * Tests the financial calculations independently of the database.
 */
function computeRunway(totalIncome, totalExpense, dayOfMonth) {
  const remaining = totalIncome - totalExpense;
  const dailyBurn = dayOfMonth > 0 ? totalExpense / dayOfMonth : 0;
  const runway = dailyBurn > 0 ? Math.floor(remaining / dailyBurn) : remaining > 0 ? 999 : 0;
  return { remaining, dailyBurn: Math.round(dailyBurn * 100) / 100, runway };
}

describe('Runway and burn rate calculations', () => {
  it('computes basic runway correctly', () => {
    // $3000 income, $1500 spent by day 15 → $100/day burn → 15 days runway
    const result = computeRunway(3000, 1500, 15);
    expect(result.remaining).toBe(1500);
    expect(result.dailyBurn).toBe(100);
    expect(result.runway).toBe(15);
  });

  it('returns 999 runway when no expenses and positive income', () => {
    const result = computeRunway(5000, 0, 10);
    expect(result.remaining).toBe(5000);
    expect(result.dailyBurn).toBe(0);
    expect(result.runway).toBe(999);
  });

  it('returns 0 runway when no income and no expenses', () => {
    const result = computeRunway(0, 0, 10);
    expect(result.remaining).toBe(0);
    expect(result.dailyBurn).toBe(0);
    expect(result.runway).toBe(0);
  });

  it('returns negative runway when overspent', () => {
    const result = computeRunway(1000, 2000, 10);
    expect(result.remaining).toBe(-1000);
    expect(result.dailyBurn).toBe(200);
    // -1000 / 200 = -5, floored = -5
    expect(result.runway).toBe(-5);
  });

  it('handles day 1 of month', () => {
    const result = computeRunway(5000, 100, 1);
    expect(result.dailyBurn).toBe(100);
    expect(result.remaining).toBe(4900);
    expect(result.runway).toBe(49);
  });

  it('handles dayOfMonth = 0 edge case', () => {
    // dayOfMonth 0 means no days elapsed, dailyBurn should be 0
    const result = computeRunway(5000, 0, 0);
    expect(result.dailyBurn).toBe(0);
    expect(result.runway).toBe(999);
  });

  it('rounds dailyBurn to 2 decimal places', () => {
    const result = computeRunway(3000, 1000, 7);
    // 1000 / 7 = 142.857... → 142.86
    expect(result.dailyBurn).toBe(142.86);
  });

  it('computes correctly at end of month', () => {
    const result = computeRunway(4000, 3800, 30);
    // 3800/30 = 126.67/day, remaining = 200, runway = floor(200/126.67) = 1
    expect(result.remaining).toBe(200);
    expect(result.runway).toBe(1);
  });

  it('exact breakeven returns 0 runway', () => {
    const result = computeRunway(1000, 1000, 10);
    expect(result.remaining).toBe(0);
    expect(result.dailyBurn).toBe(100);
    expect(result.runway).toBe(0);
  });
});
