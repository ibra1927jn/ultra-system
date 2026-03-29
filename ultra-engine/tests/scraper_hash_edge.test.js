import { describe, it, expect, vi } from 'vitest';

// Mock dependencies
vi.mock('cheerio', () => ({ default: { load: vi.fn() } }));
vi.mock('../src/db.js', () => ({
  default: { query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn() },
  query: vi.fn(), queryOne: vi.fn(), queryAll: vi.fn(),
}));
vi.mock('../src/telegram.js', () => ({
  default: { sendAlert: vi.fn() },
  sendAlert: vi.fn(),
}));

const { hashContent } = await import('../src/scraper.js');

describe('hashContent edge cases', () => {
  it('handles HTML content with tags', () => {
    const a = hashContent('<div>Hello</div>');
    const b = hashContent('<div>Hello</div>');
    expect(a).toBe(b);
  });

  it('produces different hashes for different HTML', () => {
    const a = hashContent('<div>Version 1</div>');
    const b = hashContent('<div>Version 2</div>');
    expect(a).not.toBe(b);
  });

  it('handles content with unicode characters', () => {
    const a = hashContent('Café résumé naïve');
    const b = hashContent('Café résumé naïve');
    expect(a).toBe(b);
  });

  it('different unicode strings produce different hashes', () => {
    const a = hashContent('こんにちは');
    const b = hashContent('さようなら');
    expect(a).not.toBe(b);
  });

  it('handles content with only whitespace', () => {
    const result = hashContent('   \n\t\n   ');
    expect(result).toBe('0'); // collapses to empty after whitespace removal
  });

  it('handles content with special characters', () => {
    const hash = hashContent('!@#$%^&*()_+-=[]{}|;:,.<>?');
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(0);
  });

  it('handles content with newlines as whitespace', () => {
    const a = hashContent('line1\nline2\nline3');
    const b = hashContent('line1 line2 line3');
    // Both collapse whitespace, so they should match
    expect(a).toBe(b);
  });

  it('handles single character input', () => {
    const result = hashContent('a');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns consistent results across multiple calls', () => {
    const input = 'consistency test string 12345';
    const results = Array.from({ length: 10 }, () => hashContent(input));
    expect(new Set(results).size).toBe(1);
  });
});
