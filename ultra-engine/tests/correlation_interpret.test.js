import { describe, it, expect } from 'vitest';

/**
 * Pure correlation interpretation logic extracted from routes/bio.js lines 108-116.
 * Tests the human-readable insight generation from Pearson correlation values.
 */
function interpretCorrelation(key, val) {
  if (val === null) return null;
  const [a, , b] = key.split('_');
  const strength = Math.abs(val) >= 0.7 ? 'fuerte' : Math.abs(val) >= 0.4 ? 'moderada' : 'debil';
  const direction = val > 0 ? 'positiva' : 'negativa';
  if (Math.abs(val) >= 0.4) {
    return `${a}/${b}: correlacion ${strength} ${direction} (${val})`;
  }
  return null; // weak correlations are filtered out
}

describe('Bio correlation interpretation', () => {
  it('returns null for null correlation', () => {
    expect(interpretCorrelation('sleep_vs_energy', null)).toBeNull();
  });

  it('identifies strong positive correlation', () => {
    const result = interpretCorrelation('sleep_vs_energy', 0.85);
    expect(result).toBe('sleep/energy: correlacion fuerte positiva (0.85)');
  });

  it('identifies strong negative correlation', () => {
    const result = interpretCorrelation('sleep_vs_mood', -0.75);
    expect(result).toBe('sleep/mood: correlacion fuerte negativa (-0.75)');
  });

  it('identifies moderate positive correlation', () => {
    const result = interpretCorrelation('exercise_vs_energy', 0.55);
    expect(result).toBe('exercise/energy: correlacion moderada positiva (0.55)');
  });

  it('identifies moderate negative correlation', () => {
    const result = interpretCorrelation('energy_vs_mood', -0.45);
    expect(result).toBe('energy/mood: correlacion moderada negativa (-0.45)');
  });

  it('filters out weak correlations (returns null)', () => {
    expect(interpretCorrelation('sleep_vs_energy', 0.3)).toBeNull();
    expect(interpretCorrelation('sleep_vs_energy', -0.2)).toBeNull();
    expect(interpretCorrelation('sleep_vs_energy', 0.0)).toBeNull();
  });

  it('boundary: exactly 0.7 is fuerte', () => {
    const result = interpretCorrelation('sleep_vs_energy', 0.7);
    expect(result).toContain('fuerte');
  });

  it('boundary: exactly 0.4 is moderada', () => {
    const result = interpretCorrelation('sleep_vs_energy', 0.4);
    expect(result).toContain('moderada');
  });

  it('boundary: exactly -0.4 is moderada negativa', () => {
    const result = interpretCorrelation('sleep_vs_energy', -0.4);
    expect(result).toContain('moderada negativa');
  });

  it('boundary: 0.39 is filtered out', () => {
    expect(interpretCorrelation('sleep_vs_energy', 0.39)).toBeNull();
  });

  it('handles perfect correlation (1.0)', () => {
    const result = interpretCorrelation('sleep_vs_energy', 1.0);
    expect(result).toContain('fuerte positiva');
  });

  it('handles perfect negative correlation (-1.0)', () => {
    const result = interpretCorrelation('sleep_vs_energy', -1.0);
    expect(result).toContain('fuerte negativa');
  });
});
