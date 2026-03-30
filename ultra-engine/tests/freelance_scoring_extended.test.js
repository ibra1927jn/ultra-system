import { describe, it, expect } from 'vitest';
import { scoreProject, SKILL_KEYWORDS } from '../src/utils/freelance_scoring.js';

describe('freelance_scoring extended', () => {
  describe('SKILL_KEYWORDS', () => {
    it('exports all expected keyword categories', () => {
      expect(SKILL_KEYWORDS).toHaveProperty('react');
      expect(SKILL_KEYWORDS).toHaveProperty('supabase');
      expect(SKILL_KEYWORDS).toHaveProperty('api');
      expect(SKILL_KEYWORDS).toHaveProperty('javascript');
    });

    it('supabase has highest single weight (10)', () => {
      const max = Math.max(...Object.values(SKILL_KEYWORDS));
      expect(max).toBe(10);
      expect(SKILL_KEYWORDS['supabase']).toBe(10);
    });

    it('all weights are positive integers', () => {
      for (const [key, val] of Object.entries(SKILL_KEYWORDS)) {
        expect(val, `${key} weight`).toBeGreaterThan(0);
        expect(Number.isInteger(val), `${key} is integer`).toBe(true);
      }
    });
  });

  describe('scoreProject edge cases', () => {
    it('matches keyword in title only', () => {
      expect(scoreProject('docker setup', '', [])).toBe(6);
    });

    it('matches keyword in description only', () => {
      expect(scoreProject('', 'using docker for deployment', [])).toBe(6);
    });

    it('matches keyword in skills only', () => {
      expect(scoreProject('Generic', 'Generic', ['docker'])).toBe(6);
    });

    it('does not double-count keyword present in multiple fields', () => {
      const score = scoreProject('docker', 'docker', ['docker']);
      expect(score).toBe(6); // still just docker weight once
    });

    it('matches three.js correctly (with dot)', () => {
      expect(scoreProject('Three.js visualization', '', [])).toBe(9);
    });

    it('matches c++ correctly (with plus signs)', () => {
      expect(scoreProject('C++ game engine', '', [])).toBe(8);
    });

    it('handles null-like values in skills array', () => {
      expect(scoreProject('test', 'test', [''])).toBe(0);
    });

    it('accumulates multiple keyword matches', () => {
      const score = scoreProject('React and Node project', '', []);
      // react(8) + node(7) = 15
      expect(score).toBe(15);
    });

    it('matches substring keywords (api in fastapi)', () => {
      const score = scoreProject('FastAPI backend', '', []);
      // fastapi(9) + api(5) + backend(5) = 19
      expect(score).toBe(19);
    });
  });
});
