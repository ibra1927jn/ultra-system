import { describe, it, expect, vi } from 'vitest';

// Mock DB and telegram before importing
vi.mock('../src/db.js', () => ({
  default: { query: vi.fn(), queryAll: vi.fn(), queryOne: vi.fn() },
  query: vi.fn(),
  queryAll: vi.fn(),
  queryOne: vi.fn(),
}));
vi.mock('../src/telegram.js', () => ({
  default: { sendAlert: vi.fn() },
  sendAlert: vi.fn(),
}));

const { scoreProject } = await import('../src/freelance_scraper.js');

describe('scoreProject() — real import', () => {
  it('returns 0 for unrelated project', () => {
    expect(scoreProject('Accounting help', 'Excel work', ['excel'])).toBe(0);
  });

  it('scores react keyword', () => {
    expect(scoreProject('React app', '', [])).toBeGreaterThan(0);
  });

  it('accumulates multiple keyword matches', () => {
    const score = scoreProject('React TypeScript Node', '', []);
    expect(score).toBeGreaterThanOrEqual(19); // 8+8+7 at minimum (may include substring matches)
  });

  it('caps at 100', () => {
    const score = scoreProject(
      'react typescript node python fastapi supabase firebase postgresql docker',
      'three.js opengl c++ rust capacitor pwa electron api scraping automation bot dashboard fullstack backend frontend javascript html css sql',
      []
    );
    expect(score).toBe(100);
  });

  it('is case insensitive', () => {
    expect(scoreProject('SUPABASE', '', [])).toBe(10);
  });

  it('handles empty inputs gracefully', () => {
    expect(scoreProject('', '', [])).toBe(0);
  });

  it('matches keywords in skills array', () => {
    const score = scoreProject('Generic', 'No match', ['docker']);
    expect(score).toBe(6);
  });
});
