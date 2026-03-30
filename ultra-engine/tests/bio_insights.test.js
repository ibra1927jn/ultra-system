import { describe, it, expect } from 'vitest';
import { generateCorrelationInsights } from '../src/utils/bio_insights.js';

describe('generateCorrelationInsights()', () => {
  it('returns empty array for all-null correlations', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: null,
      sleep_vs_mood: null,
    });
    expect(result).toEqual([]);
  });

  it('returns empty array for weak correlations (|r| < 0.4)', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0.2,
      sleep_vs_mood: -0.3,
      exercise_vs_energy: 0.1,
    });
    expect(result).toEqual([]);
  });

  it('identifies moderate positive correlation', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0.55,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('sleep/energy');
    expect(result[0]).toContain('moderada');
    expect(result[0]).toContain('positiva');
    expect(result[0]).toContain('0.55');
  });

  it('identifies moderate negative correlation', () => {
    const result = generateCorrelationInsights({
      exercise_vs_mood: -0.5,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('exercise/mood');
    expect(result[0]).toContain('moderada');
    expect(result[0]).toContain('negativa');
  });

  it('identifies strong positive correlation (|r| >= 0.7)', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0.85,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('fuerte');
    expect(result[0]).toContain('positiva');
  });

  it('identifies strong negative correlation', () => {
    const result = generateCorrelationInsights({
      sleep_vs_mood: -0.75,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('fuerte');
    expect(result[0]).toContain('negativa');
  });

  it('filters out weak correlations from mixed set', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0.8,       // strong positive — include
      sleep_vs_mood: 0.2,         // weak — exclude
      exercise_vs_energy: null,   // null — exclude
      exercise_vs_mood: -0.45,    // moderate negative — include
      energy_vs_mood: 0.39,       // just below threshold — exclude
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('sleep/energy');
    expect(result[1]).toContain('exercise/mood');
  });

  it('handles boundary value at exactly 0.4', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0.4,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('moderada');
  });

  it('handles boundary value at exactly -0.4', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: -0.4,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('moderada');
    expect(result[0]).toContain('negativa');
  });

  it('handles boundary value at exactly 0.7', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0.7,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('fuerte');
  });

  it('handles empty correlations object', () => {
    expect(generateCorrelationInsights({})).toEqual([]);
  });

  it('handles zero correlation', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0,
    });
    expect(result).toEqual([]);
  });

  it('includes r value in output string', () => {
    const result = generateCorrelationInsights({
      sleep_vs_energy: 0.62,
    });
    expect(result[0]).toContain('(0.62)');
  });
});
