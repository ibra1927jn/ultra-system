import { describe, it, expect } from 'vitest';
import { BIO_WEEKLY_SQL, BIO_CORRELATION_SQL } from '../src/utils/bio_queries.js';

describe('BIO_WEEKLY_SQL', () => {
  it('is a non-empty string', () => {
    expect(typeof BIO_WEEKLY_SQL).toBe('string');
    expect(BIO_WEEKLY_SQL.length).toBeGreaterThan(0);
  });

  it('selects expected aggregate columns', () => {
    expect(BIO_WEEKLY_SQL).toContain('entries');
    expect(BIO_WEEKLY_SQL).toContain('avg_sleep');
    expect(BIO_WEEKLY_SQL).toContain('avg_energy');
    expect(BIO_WEEKLY_SQL).toContain('avg_mood');
    expect(BIO_WEEKLY_SQL).toContain('avg_exercise');
  });

  it('queries from bio_checks table', () => {
    expect(BIO_WEEKLY_SQL).toContain('FROM bio_checks');
  });

  it('filters to last 7 days', () => {
    expect(BIO_WEEKLY_SQL).toContain('CURRENT_DATE - 7');
  });

  it('uses AVG aggregation for metrics', () => {
    expect(BIO_WEEKLY_SQL).toContain('AVG(sleep_hours)');
    expect(BIO_WEEKLY_SQL).toContain('AVG(energy_level)');
    expect(BIO_WEEKLY_SQL).toContain('AVG(mood)');
    expect(BIO_WEEKLY_SQL).toContain('AVG(exercise_minutes)');
  });

  it('uses COUNT for entries', () => {
    expect(BIO_WEEKLY_SQL).toContain('COUNT(*)');
  });

  it('rounds numeric results', () => {
    const roundCount = (BIO_WEEKLY_SQL.match(/ROUND\(/g) || []).length;
    expect(roundCount).toBeGreaterThanOrEqual(4);
  });
});

describe('BIO_CORRELATION_SQL', () => {
  it('is a non-empty string', () => {
    expect(typeof BIO_CORRELATION_SQL).toBe('string');
    expect(BIO_CORRELATION_SQL.length).toBeGreaterThan(0);
  });

  it('selects individual metric columns', () => {
    expect(BIO_CORRELATION_SQL).toContain('sleep_hours');
    expect(BIO_CORRELATION_SQL).toContain('energy_level');
    expect(BIO_CORRELATION_SQL).toContain('mood');
    expect(BIO_CORRELATION_SQL).toContain('exercise_minutes');
  });

  it('queries from bio_checks table', () => {
    expect(BIO_CORRELATION_SQL).toContain('FROM bio_checks');
  });

  it('filters to last 30 days for correlation window', () => {
    expect(BIO_CORRELATION_SQL).toContain('CURRENT_DATE - 30');
  });

  it('orders by date descending', () => {
    expect(BIO_CORRELATION_SQL).toContain('ORDER BY date DESC');
  });

  it('does not use parameterized placeholders (date-relative query)', () => {
    expect(BIO_CORRELATION_SQL).not.toContain('$1');
  });
});
