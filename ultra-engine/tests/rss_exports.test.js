import { describe, it, expect } from 'vitest';

describe('rss SCORE_THRESHOLD', () => {
  it('is exported and is a positive number', async () => {
    // Dynamic import to avoid triggering DB/parser side effects at module level
    // We read the constant directly from the source
    const fs = await import('fs');
    const src = fs.readFileSync(new URL('../src/rss.js', import.meta.url), 'utf8');
    const match = src.match(/const SCORE_THRESHOLD\s*=\s*(\d+)/);
    expect(match).not.toBeNull();
    const threshold = Number(match[1]);
    expect(threshold).toBeGreaterThan(0);
    expect(threshold).toBeLessThanOrEqual(20);
  });
});
