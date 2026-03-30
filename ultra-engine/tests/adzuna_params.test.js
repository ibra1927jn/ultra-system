import { describe, it, expect } from 'vitest';
import { buildAdzunaParams, buildAdzunaUrl, normalizeAdzunaJob, ADZUNA_BASE_URL } from '../src/utils/adzuna_params.js';

describe('buildAdzunaParams', () => {
  const base = { appId: 'test_id', appKey: 'test_key', where: 'Christchurch' };

  it('includes required fields', () => {
    const params = buildAdzunaParams(base);
    expect(params.get('app_id')).toBe('test_id');
    expect(params.get('app_key')).toBe('test_key');
    expect(params.get('where')).toBe('Christchurch');
  });

  it('uses defaults for optional fields', () => {
    const params = buildAdzunaParams(base);
    expect(params.get('results_per_page')).toBe('20');
    expect(params.get('sort_by')).toBe('date');
    expect(params.get('max_days_old')).toBe('30');
  });

  it('allows overriding defaults', () => {
    const params = buildAdzunaParams({ ...base, resultsPerPage: 10, sortBy: 'relevance', maxDaysOld: 7 });
    expect(params.get('results_per_page')).toBe('10');
    expect(params.get('sort_by')).toBe('relevance');
    expect(params.get('max_days_old')).toBe('7');
  });

  it('sets what_or when provided', () => {
    const params = buildAdzunaParams({ ...base, what_or: 'warehouse packhouse' });
    expect(params.get('what_or')).toBe('warehouse packhouse');
    expect(params.get('what')).toBeNull();
  });

  it('sets what when provided', () => {
    const params = buildAdzunaParams({ ...base, what: 'developer' });
    expect(params.get('what')).toBe('developer');
    expect(params.get('what_or')).toBeNull();
  });

  it('can set both what and what_or', () => {
    const params = buildAdzunaParams({ ...base, what: 'senior', what_or: 'developer programmer' });
    expect(params.get('what')).toBe('senior');
    expect(params.get('what_or')).toBe('developer programmer');
  });

  it('omits what and what_or when not provided', () => {
    const params = buildAdzunaParams(base);
    expect(params.get('what')).toBeNull();
    expect(params.get('what_or')).toBeNull();
  });
});

describe('buildAdzunaUrl', () => {
  it('produces a valid URL with base', () => {
    const url = buildAdzunaUrl({ appId: 'id', appKey: 'key', where: 'Auckland' });
    expect(url).toContain(ADZUNA_BASE_URL);
    expect(url).toContain('app_id=id');
    expect(url).toContain('where=Auckland');
  });

  it('includes what_or in URL', () => {
    const url = buildAdzunaUrl({ appId: 'id', appKey: 'key', where: 'NZ', what_or: 'warehouse' });
    expect(url).toContain('what_or=warehouse');
  });
});

describe('normalizeAdzunaJob', () => {
  it('extracts redirect_url preferentially', () => {
    const job = { redirect_url: 'https://r.example.com', url: 'https://example.com', title: 'Dev' };
    expect(normalizeAdzunaJob(job).url).toBe('https://r.example.com');
  });

  it('falls back to url when no redirect_url', () => {
    const job = { url: 'https://example.com', title: 'Dev' };
    expect(normalizeAdzunaJob(job).url).toBe('https://example.com');
  });

  it('returns empty string when no URLs', () => {
    expect(normalizeAdzunaJob({ title: 'Dev' }).url).toBe('');
  });

  it('extracts title', () => {
    expect(normalizeAdzunaJob({ title: 'Senior Developer' }).title).toBe('Senior Developer');
  });

  it('returns empty string for missing title', () => {
    expect(normalizeAdzunaJob({}).title).toBe('');
  });

  it('extracts company display_name', () => {
    const job = { title: 'Dev', company: { display_name: 'Acme Corp' } };
    expect(normalizeAdzunaJob(job).company).toBe('Acme Corp');
  });

  it('returns empty string when no company', () => {
    expect(normalizeAdzunaJob({ title: 'Dev' }).company).toBe('');
  });

  it('truncates description to 500 chars', () => {
    const longDesc = 'x'.repeat(600);
    const result = normalizeAdzunaJob({ title: 'Dev', description: longDesc });
    expect(result.description).toHaveLength(500);
  });

  it('returns null for missing description', () => {
    expect(normalizeAdzunaJob({ title: 'Dev' }).description).toBeNull();
  });

  it('preserves short descriptions', () => {
    const job = { title: 'Dev', description: 'Great job opportunity' };
    expect(normalizeAdzunaJob(job).description).toBe('Great job opportunity');
  });
});
