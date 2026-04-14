// Unit tests for public/money-utils.js — pure functions, no DOM.
import { describe, it, expect } from 'vitest';

const U = require('../public/money-utils.js');

describe('esc', () => {
  it('escapes XSS-relevant characters', () => {
    expect(U.esc('<script>alert("x")</script>')).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(U.esc("it's")).toBe('it&#39;s');
    expect(U.esc('a & b')).toBe('a &amp; b');
  });
  it('handles null/undefined/non-string', () => {
    expect(U.esc(null)).toBe('');
    expect(U.esc(undefined)).toBe('');
    expect(U.esc(123)).toBe('123');
    expect(U.esc('')).toBe('');
  });
});

describe('fmt', () => {
  it('formats integers with en-NZ thousands separator', () => {
    expect(U.fmt(1234567)).toBe('1,234,567');
    expect(U.fmt(0)).toBe('0');
  });
  it('respects opts.dp for decimals', () => {
    expect(U.fmt(1234.5678, { dp: 2 })).toBe('1,234.57');
    expect(U.fmt(1234.5678, { dp: 0 })).toBe('1,235');
  });
  it('opts.sign forces + on positives', () => {
    expect(U.fmt(100, { sign: true })).toBe('+100');
    expect(U.fmt(-100, { sign: true })).toBe('-100');
    expect(U.fmt(0, { sign: true })).toBe('+0');
  });
  it('returns — for null/NaN/undefined', () => {
    expect(U.fmt(null)).toBe('—');
    expect(U.fmt(undefined)).toBe('—');
    expect(U.fmt(NaN)).toBe('—');
  });
});

describe('fmtPct', () => {
  it('formats with + or - prefix and 1 decimal', () => {
    expect(U.fmtPct(7.13)).toBe('+7.1%');
    expect(U.fmtPct(-2.5)).toBe('-2.5%');
    expect(U.fmtPct(0)).toBe('+0.0%');
  });
  it('returns — on invalid', () => {
    expect(U.fmtPct(null)).toBe('—');
    expect(U.fmtPct(NaN)).toBe('—');
  });
});

describe('dateOnly', () => {
  it('slices ISO timestamp to YYYY-MM-DD', () => {
    expect(U.dateOnly('2026-04-14T09:23:31.810Z')).toBe('2026-04-14');
    expect(U.dateOnly('2026-04-14')).toBe('2026-04-14');
  });
  it('returns — on falsy', () => {
    expect(U.dateOnly(null)).toBe('—');
    expect(U.dateOnly('')).toBe('—');
    expect(U.dateOnly(undefined)).toBe('—');
  });
});

describe('thisMonth', () => {
  it('returns YYYY-MM with zero-padded month', () => {
    const r = U.thisMonth();
    expect(r).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
  });
});

describe('budgetSeverity', () => {
  it('classifies pct into ok/warn/danger', () => {
    expect(U.budgetSeverity(50)).toBe('ok');
    expect(U.budgetSeverity(80)).toBe('warn');
    expect(U.budgetSeverity(99)).toBe('warn');
    expect(U.budgetSeverity(100)).toBe('danger');
    expect(U.budgetSeverity(150)).toBe('danger');
  });
  it('respects custom thresholds', () => {
    expect(U.budgetSeverity(70, 60, 90)).toBe('warn');
    expect(U.budgetSeverity(95, 60, 90)).toBe('danger');
  });
});

describe('daysUntilLabel', () => {
  it('formats overdue / today / future days', () => {
    expect(U.daysUntilLabel(-3)).toBe('3d overdue');
    expect(U.daysUntilLabel(0)).toBe('today');
    expect(U.daysUntilLabel(7)).toBe('7d');
  });
  it('returns — for null', () => {
    expect(U.daysUntilLabel(null)).toBe('—');
  });
});
