import { describe, it, expect, vi } from 'vitest';

// Mock dependencies so we can import hashContent from the real module
vi.mock('cheerio', () => ({ default: { load: vi.fn() } }));
vi.mock('../src/db.js', () => ({
  default: { query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn() },
  query: vi.fn(),
  queryOne: vi.fn(),
  queryAll: vi.fn(),
}));
vi.mock('../src/telegram.js', () => ({
  default: { sendAlert: vi.fn() },
  sendAlert: vi.fn(),
}));

const { hashContent } = await import('../src/scraper.js');

describe('scraper hashContent', () => {
  it('returns deterministic hash for same input', () => {
    const a = hashContent('hello world');
    const b = hashContent('hello world');
    expect(a).toBe(b);
  });

  it('returns different hashes for different input', () => {
    const a = hashContent('page version 1');
    const b = hashContent('page version 2');
    expect(a).not.toBe(b);
  });

  it('ignores whitespace differences', () => {
    const a = hashContent('hello   world\n\tfoo');
    const b = hashContent('hello world foo');
    expect(a).toBe(b);
  });

  it('handles empty string', () => {
    const result = hashContent('');
    expect(result).toBe('0');
  });

  it('handles very long content (truncates to 10000 chars)', () => {
    const long = 'a'.repeat(50000);
    const truncated = 'a'.repeat(10000);
    expect(hashContent(long)).toBe(hashContent(truncated));
  });

  it('returns a base-36 string', () => {
    const result = hashContent('test content');
    expect(result).toMatch(/^-?[0-9a-z]+$/);
  });

  it('differentiates similar strings', () => {
    const a = hashContent('abc');
    const b = hashContent('abd');
    expect(a).not.toBe(b);
  });
});
