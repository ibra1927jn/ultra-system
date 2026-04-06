import { describe, it, expect } from 'vitest';
import { currentMonth } from '../src/utils/date_format.js';

describe('currentMonth', () => {
  it('returns a string in YYYY-MM format', () => {
    const result = currentMonth();
    expect(result).toMatch(/^\d{4}-\d{2}$/);
  });

  it('returns a 7-character string', () => {
    expect(currentMonth()).toHaveLength(7);
  });

  it('returns the current year', () => {
    const year = new Date().getFullYear().toString();
    expect(currentMonth().startsWith(year)).toBe(true);
  });

  it('returns the current month zero-padded', () => {
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    expect(currentMonth().endsWith(month)).toBe(true);
  });
});
