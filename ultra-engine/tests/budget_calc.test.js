import { describe, it, expect } from 'vitest';
import { calculateRunway } from '../src/utils/budget_calc.js';

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
