import { describe, it, expect } from 'vitest';

/**
 * Pure scoring logic extracted from freelance_scraper.js scoreProject.
 * Tests the algorithm without requiring network or DB access.
 */
const SKILL_KEYWORDS = {
  'react': 8, 'typescript': 8, 'node': 7, 'python': 7, 'fastapi': 9,
  'supabase': 10, 'firebase': 7, 'postgresql': 7, 'docker': 6,
  'three.js': 9, 'opengl': 8, 'c++': 8, 'rust': 6,
  'capacitor': 9, 'pwa': 8, 'electron': 6,
  'api': 5, 'scraping': 6, 'automation': 6, 'bot': 5,
  'dashboard': 5, 'fullstack': 6, 'backend': 5, 'frontend': 5,
  'javascript': 4, 'html': 3, 'css': 3, 'sql': 4,
};

function scoreProject(title, description, skills) {
  const text = `${title} ${description} ${skills.join(' ')}`.toLowerCase();
  let score = 0;

  for (const [keyword, weight] of Object.entries(SKILL_KEYWORDS)) {
    if (text.includes(keyword.toLowerCase())) {
      score += weight;
    }
  }

  return Math.min(score, 100);
}

describe('freelance project scoring', () => {
  it('returns 0 for unrelated project', () => {
    expect(scoreProject('Accounting help needed', 'Excel spreadsheet work', ['excel'])).toBe(0);
  });

  it('scores high for full-stack React/Node project', () => {
    const score = scoreProject(
      'React TypeScript Dashboard',
      'Build a fullstack dashboard with Node backend',
      ['react', 'typescript', 'node']
    );
    // react(8) + typescript(8) + node(7) + dashboard(5) + fullstack(6) + backend(5) + javascript(4) = 43
    expect(score).toBeGreaterThanOrEqual(30);
  });

  it('caps score at 100', () => {
    const score = scoreProject(
      'React TypeScript Node Python FastAPI Supabase Firebase PostgreSQL Docker',
      'Three.js OpenGL C++ Rust Capacitor PWA Electron API Scraping Automation Bot Dashboard Fullstack Backend Frontend JavaScript HTML CSS SQL',
      []
    );
    expect(score).toBe(100);
  });

  it('matches keywords in skills array', () => {
    const score = scoreProject('Generic title', 'No keywords here', ['python', 'fastapi']);
    // python(7) + fastapi(9) + api(5, substring of fastapi) = 21
    expect(score).toBe(21);
  });

  it('is case insensitive', () => {
    const score = scoreProject('REACT DEVELOPER', '', []);
    expect(score).toBeGreaterThan(0);
  });

  it('handles empty inputs', () => {
    expect(scoreProject('', '', [])).toBe(0);
  });

  it('scores supabase projects highest single keyword', () => {
    const score = scoreProject('Supabase integration', '', []);
    expect(score).toBe(10);
  });
});
