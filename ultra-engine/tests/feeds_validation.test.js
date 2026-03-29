import { describe, it, expect } from 'vitest';

/**
 * Validation logic extracted from routes/feeds.js handlers.
 */
function validateFeed({ url, name }) {
  if (!url || !name) {
    return { ok: false, error: 'Faltan url y name' };
  }
  return { ok: true, data: { url, name } };
}

function validateKeyword({ keyword }) {
  if (!keyword) {
    return { ok: false, error: 'Falta campo obligatorio: keyword' };
  }
  return { ok: true, keyword };
}

describe('feed validation', () => {
  it('accepts valid feed', () => {
    const result = validateFeed({ url: 'https://example.com/rss', name: 'Test Feed' });
    expect(result.ok).toBe(true);
    expect(result.data.url).toBe('https://example.com/rss');
  });

  it('rejects missing url', () => {
    expect(validateFeed({ url: '', name: 'Test' }).ok).toBe(false);
  });

  it('rejects missing name', () => {
    expect(validateFeed({ url: 'https://example.com', name: '' }).ok).toBe(false);
  });

  it('rejects both missing', () => {
    expect(validateFeed({}).ok).toBe(false);
  });

  it('rejects null url', () => {
    expect(validateFeed({ url: null, name: 'Test' }).ok).toBe(false);
  });

  it('rejects undefined name', () => {
    expect(validateFeed({ url: 'https://example.com' }).ok).toBe(false);
  });
});

describe('keyword validation', () => {
  it('accepts valid keyword', () => {
    const result = validateKeyword({ keyword: 'javascript' });
    expect(result.ok).toBe(true);
  });

  it('rejects empty keyword', () => {
    expect(validateKeyword({ keyword: '' }).ok).toBe(false);
  });

  it('rejects missing keyword', () => {
    expect(validateKeyword({}).ok).toBe(false);
  });

  it('rejects null keyword', () => {
    expect(validateKeyword({ keyword: null }).ok).toBe(false);
  });
});
