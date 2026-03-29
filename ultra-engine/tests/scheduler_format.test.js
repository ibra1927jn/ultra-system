import { describe, it, expect } from 'vitest';

/**
 * bar() — progress bar renderer extracted from scheduler.js sendBioWeeklySummary.
 * Generates a 10-char bar: filled █ + empty ░
 */
function bar(val) {
  const filled = Math.min(10, Math.max(0, Math.round(parseFloat(val))));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

describe('scheduler bar() progress renderer', () => {
  it('renders full bar for value 10', () => {
    expect(bar(10)).toBe('██████████');
  });

  it('renders empty bar for value 0', () => {
    expect(bar(0)).toBe('░░░░░░░░░░');
  });

  it('renders half bar for value 5', () => {
    expect(bar(5)).toBe('█████░░░░░');
  });

  it('always produces exactly 10 characters', () => {
    for (const v of [-5, -1, 0, 3, 5, 7, 10, 15, 100]) {
      expect(bar(v)).toHaveLength(10);
    }
  });

  it('clamps negative values to empty bar', () => {
    expect(bar(-3)).toBe('░░░░░░░░░░');
  });

  it('clamps values above 10 to full bar', () => {
    expect(bar(15)).toBe('██████████');
  });

  it('rounds float values correctly', () => {
    expect(bar(7.4)).toBe('███████░░░');
    expect(bar(7.6)).toBe('████████░░');
  });

  it('handles string number inputs', () => {
    expect(bar('6')).toBe('██████░░░░');
    expect(bar('3.2')).toBe('███░░░░░░░');
  });

  it('returns empty string for non-numeric input (NaN propagates)', () => {
    expect(bar('abc')).toBe('');
  });
});

/**
 * Urgency maps extracted from scheduler.js checkLogisticsNext48h
 */
const typeEmoji = { transport: '🚌', accommodation: '🏠', visa: '🛂', appointment: '📋' };
const urgencyMap = { 0: '🔴 HOY', 1: '🟡 MANANA', 2: '🟢 Pasado manana' };

describe('scheduler logistics emoji mapping', () => {
  it('maps known transport types', () => {
    expect(typeEmoji['transport']).toBe('🚌');
    expect(typeEmoji['accommodation']).toBe('🏠');
    expect(typeEmoji['visa']).toBe('🛂');
    expect(typeEmoji['appointment']).toBe('📋');
  });

  it('returns undefined for unknown types (fallback to 📌 in scheduler)', () => {
    expect(typeEmoji['other']).toBeUndefined();
  });

  it('maps urgency days correctly', () => {
    expect(urgencyMap[0]).toBe('🔴 HOY');
    expect(urgencyMap[1]).toBe('🟡 MANANA');
    expect(urgencyMap[2]).toBe('🟢 Pasado manana');
  });
});
