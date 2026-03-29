import { describe, it, expect } from 'vitest';

/**
 * Validation logic extracted from routes/bio.js POST handler.
 * Tests the pure validation rules without needing Express or DB.
 */

function validateBioEntry({ sleep_hours, energy_level, mood, exercise_minutes }) {
  if (sleep_hours == null || energy_level == null || mood == null) {
    return { ok: false, error: 'Faltan campos obligatorios: sleep_hours, energy_level, mood' };
  }
  if (energy_level < 1 || energy_level > 10 || mood < 1 || mood > 10) {
    return { ok: false, error: 'energy_level y mood deben estar entre 1 y 10' };
  }
  const parsedSleep = parseFloat(sleep_hours);
  if (isNaN(parsedSleep) || parsedSleep < 0 || parsedSleep > 24) {
    return { ok: false, error: 'sleep_hours debe estar entre 0 y 24' };
  }
  return {
    ok: true,
    data: {
      sleep_hours: parsedSleep,
      energy_level: parseInt(energy_level),
      mood: parseInt(mood),
      exercise_minutes: parseInt(exercise_minutes) || 0,
    },
  };
}

describe('bio entry validation', () => {
  const valid = { sleep_hours: 7.5, energy_level: 6, mood: 7, exercise_minutes: 30 };

  it('accepts valid entry', () => {
    const result = validateBioEntry(valid);
    expect(result.ok).toBe(true);
    expect(result.data.sleep_hours).toBe(7.5);
  });

  it('rejects missing sleep_hours', () => {
    const result = validateBioEntry({ ...valid, sleep_hours: null });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('campos obligatorios');
  });

  it('rejects missing energy_level', () => {
    const result = validateBioEntry({ ...valid, energy_level: null });
    expect(result.ok).toBe(false);
  });

  it('rejects missing mood', () => {
    const result = validateBioEntry({ ...valid, mood: null });
    expect(result.ok).toBe(false);
  });

  it('rejects energy_level below 1', () => {
    const result = validateBioEntry({ ...valid, energy_level: 0 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('entre 1 y 10');
  });

  it('rejects energy_level above 10', () => {
    const result = validateBioEntry({ ...valid, energy_level: 11 });
    expect(result.ok).toBe(false);
  });

  it('rejects mood below 1', () => {
    const result = validateBioEntry({ ...valid, mood: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects mood above 10', () => {
    const result = validateBioEntry({ ...valid, mood: 11 });
    expect(result.ok).toBe(false);
  });

  it('rejects negative sleep_hours', () => {
    const result = validateBioEntry({ ...valid, sleep_hours: -1 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('entre 0 y 24');
  });

  it('rejects sleep_hours > 24', () => {
    const result = validateBioEntry({ ...valid, sleep_hours: 25 });
    expect(result.ok).toBe(false);
  });

  it('rejects non-numeric sleep_hours', () => {
    const result = validateBioEntry({ ...valid, sleep_hours: 'abc' });
    expect(result.ok).toBe(false);
  });

  it('accepts boundary values (1, 10, 0h, 24h)', () => {
    expect(validateBioEntry({ ...valid, energy_level: 1, mood: 1 }).ok).toBe(true);
    expect(validateBioEntry({ ...valid, energy_level: 10, mood: 10 }).ok).toBe(true);
    expect(validateBioEntry({ ...valid, sleep_hours: 0 }).ok).toBe(true);
    expect(validateBioEntry({ ...valid, sleep_hours: 24 }).ok).toBe(true);
  });

  it('defaults exercise_minutes to 0 when falsy', () => {
    const result = validateBioEntry({ ...valid, exercise_minutes: undefined });
    expect(result.data.exercise_minutes).toBe(0);
  });
});
