import { describe, it, expect } from 'vitest';
import { extractBioArrays } from '../src/utils/bio_data.js';

describe('extractBioArrays', () => {
  it('extracts numeric arrays from bio records', () => {
    const data = [
      { sleep_hours: '7.5', energy_level: '8', mood: '7', exercise_minutes: '30' },
      { sleep_hours: '6.0', energy_level: '5', mood: '4', exercise_minutes: '0' },
    ];
    const { sleep, energy, mood, exercise } = extractBioArrays(data);
    expect(sleep).toEqual([7.5, 6.0]);
    expect(energy).toEqual([8, 5]);
    expect(mood).toEqual([7, 4]);
    expect(exercise).toEqual([30, 0]);
  });

  it('returns empty arrays for empty input', () => {
    const { sleep, energy, mood, exercise } = extractBioArrays([]);
    expect(sleep).toEqual([]);
    expect(energy).toEqual([]);
    expect(mood).toEqual([]);
    expect(exercise).toEqual([]);
  });

  it('handles single record', () => {
    const data = [{ sleep_hours: '8', energy_level: '9', mood: '10', exercise_minutes: '60' }];
    const { sleep, energy, mood, exercise } = extractBioArrays(data);
    expect(sleep).toEqual([8]);
    expect(energy).toEqual([9]);
    expect(mood).toEqual([10]);
    expect(exercise).toEqual([60]);
  });

  it('handles decimal sleep hours', () => {
    const data = [{ sleep_hours: '6.25', energy_level: '3', mood: '5', exercise_minutes: '15' }];
    const { sleep } = extractBioArrays(data);
    expect(sleep).toEqual([6.25]);
  });

  it('handles zero values', () => {
    const data = [{ sleep_hours: '0', energy_level: '0', mood: '0', exercise_minutes: '0' }];
    const { sleep, energy, mood, exercise } = extractBioArrays(data);
    expect(sleep).toEqual([0]);
    expect(energy).toEqual([0]);
    expect(mood).toEqual([0]);
    expect(exercise).toEqual([0]);
  });

  it('parses string numbers from DB rows correctly', () => {
    const data = [{ sleep_hours: '7.999', energy_level: '10', mood: '1', exercise_minutes: '120' }];
    const { sleep, energy, mood, exercise } = extractBioArrays(data);
    expect(sleep).toBeCloseTo(7.999);
    expect(energy).toEqual([10]);
    expect(mood).toEqual([1]);
    expect(exercise).toEqual([120]);
  });
});
