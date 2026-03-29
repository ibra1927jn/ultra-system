import { describe, it, expect } from 'vitest';

/**
 * Validation logic extracted from routes/jobs.js handlers.
 */
const VALID_STATUSES = ['new', 'saved', 'applied', 'rejected'];

function validateJobStatus(status) {
  if (!VALID_STATUSES.includes(status)) {
    return { ok: false, error: `Status must be: ${VALID_STATUSES.join(', ')}` };
  }
  return { ok: true, status };
}

function validateJobSource({ url, name, css_selector }) {
  if (!url || !name || !css_selector) {
    return { ok: false, error: 'Faltan url, name y css_selector' };
  }
  return { ok: true, data: { url, name, css_selector } };
}

function validateSearchQuery(query) {
  if (!query) {
    return { ok: false, error: 'Missing query' };
  }
  return { ok: true, query };
}

describe('job status validation', () => {
  it('accepts all valid statuses', () => {
    for (const s of VALID_STATUSES) {
      expect(validateJobStatus(s).ok).toBe(true);
    }
  });

  it('rejects invalid status', () => {
    const result = validateJobStatus('hired');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Status must be');
  });

  it('rejects undefined status', () => {
    expect(validateJobStatus(undefined).ok).toBe(false);
  });

  it('rejects empty string', () => {
    expect(validateJobStatus('').ok).toBe(false);
  });

  it('is case-sensitive', () => {
    expect(validateJobStatus('New').ok).toBe(false);
    expect(validateJobStatus('SAVED').ok).toBe(false);
  });

  it('rejects numeric values', () => {
    expect(validateJobStatus(1).ok).toBe(false);
  });
});

describe('job source validation', () => {
  const valid = { url: 'https://example.com', name: 'Test', css_selector: '.job' };

  it('accepts valid source', () => {
    const result = validateJobSource(valid);
    expect(result.ok).toBe(true);
    expect(result.data.url).toBe('https://example.com');
  });

  it('rejects missing url', () => {
    expect(validateJobSource({ ...valid, url: '' }).ok).toBe(false);
  });

  it('rejects missing name', () => {
    expect(validateJobSource({ ...valid, name: '' }).ok).toBe(false);
  });

  it('rejects missing css_selector', () => {
    expect(validateJobSource({ ...valid, css_selector: '' }).ok).toBe(false);
  });

  it('rejects all fields missing', () => {
    expect(validateJobSource({}).ok).toBe(false);
  });
});

describe('search query validation', () => {
  it('accepts non-empty query', () => {
    expect(validateSearchQuery('developer').ok).toBe(true);
  });

  it('rejects empty query', () => {
    expect(validateSearchQuery('').ok).toBe(false);
  });

  it('rejects undefined query', () => {
    expect(validateSearchQuery(undefined).ok).toBe(false);
  });

  it('rejects null query', () => {
    expect(validateSearchQuery(null).ok).toBe(false);
  });
});
