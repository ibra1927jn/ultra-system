import { describe, it, expect } from 'vitest';
import { formatSalary } from '../src/utils/salary_format.js';

describe('formatSalary()', () => {
  it('formats range when both min and max provided', () => {
    expect(formatSalary(50000, 70000)).toBe('$50000-$70000');
  });

  it('rounds to nearest integer', () => {
    expect(formatSalary(49999.7, 70000.3)).toBe('$50000-$70000');
  });

  it('formats "From" when only min provided', () => {
    expect(formatSalary(45000, null)).toBe('From $45000');
    expect(formatSalary(45000, 0)).toBe('From $45000');
    expect(formatSalary(45000, undefined)).toBe('From $45000');
  });

  it('returns null when no salary data', () => {
    expect(formatSalary(null, null)).toBeNull();
    expect(formatSalary(0, 0)).toBeNull();
    expect(formatSalary(undefined, undefined)).toBeNull();
  });

  it('returns null when only max provided (no min)', () => {
    expect(formatSalary(null, 70000)).toBeNull();
    expect(formatSalary(0, 70000)).toBeNull();
  });

  it('handles small salaries', () => {
    expect(formatSalary(15, 25)).toBe('$15-$25');
  });

  it('handles equal min and max', () => {
    expect(formatSalary(60000, 60000)).toBe('$60000-$60000');
  });
});
