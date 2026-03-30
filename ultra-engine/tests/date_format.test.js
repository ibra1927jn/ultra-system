import { describe, it, expect } from 'vitest';
import { toDateStr } from '../src/utils/date_format.js';

describe('toDateStr()', () => {
  it('formats a Date object to YYYY-MM-DD', () => {
    expect(toDateStr(new Date('2026-03-30T12:00:00Z'))).toBe('2026-03-30');
  });

  it('formats an ISO string to YYYY-MM-DD', () => {
    expect(toDateStr('2026-01-15T08:30:00Z')).toBe('2026-01-15');
  });

  it('formats a date-only string', () => {
    expect(toDateStr('2025-12-25')).toBe('2025-12-25');
  });

  it('formats a timestamp number', () => {
    const ts = new Date('2026-06-01T00:00:00Z').getTime();
    expect(toDateStr(ts)).toBe('2026-06-01');
  });

  it('returns today when called with no argument', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(toDateStr()).toBe(today);
  });

  it('returns today when called with undefined', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(toDateStr(undefined)).toBe(today);
  });

  it('returns today when called with null', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(toDateStr(null)).toBe(today);
  });

  it('always returns exactly 10 characters (YYYY-MM-DD)', () => {
    expect(toDateStr('2026-03-30')).toHaveLength(10);
    expect(toDateStr()).toHaveLength(10);
  });

  it('handles end-of-year dates', () => {
    expect(toDateStr('2025-12-31T23:59:59Z')).toBe('2025-12-31');
  });

  it('handles start-of-year dates', () => {
    expect(toDateStr('2026-01-01T00:00:00Z')).toBe('2026-01-01');
  });
});
