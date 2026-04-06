import { describe, it, expect } from 'vitest';
import { toDateStr } from '../src/utils/date_format.js';

describe('toDateStr()', () => {
  it('formats a Date object', () => {
    expect(toDateStr(new Date('2026-04-06T12:00:00Z'))).toBe('2026-04-06');
  });

  it('formats a date string', () => {
    expect(toDateStr('2026-01-15T00:00:00Z')).toBe('2026-01-15');
  });

  it('formats a timestamp number', () => {
    const ts = new Date('2025-12-25T00:00:00Z').getTime();
    expect(toDateStr(ts)).toBe('2025-12-25');
  });

  it('returns today when no argument', () => {
    const result = toDateStr();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe(new Date().toISOString().split('T')[0]);
  });

  it('returns today for null input', () => {
    const result = toDateStr(null);
    expect(result).toBe(new Date().toISOString().split('T')[0]);
  });

  it('returns today for undefined input', () => {
    const result = toDateStr(undefined);
    expect(result).toBe(new Date().toISOString().split('T')[0]);
  });

  it('handles epoch zero', () => {
    expect(toDateStr(0)).toBe(new Date().toISOString().split('T')[0]);
  });

  it('handles ISO string without time', () => {
    expect(toDateStr('2026-06-15')).toBe('2026-06-15');
  });

  it('output format is always YYYY-MM-DD', () => {
    const result = toDateStr('2026-01-01');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
