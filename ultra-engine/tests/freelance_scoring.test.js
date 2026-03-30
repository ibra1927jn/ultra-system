import { describe, it, expect } from 'vitest';
import { scoreProject } from '../src/utils/freelance_scoring.js';

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
