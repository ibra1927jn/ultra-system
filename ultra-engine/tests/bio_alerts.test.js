import { describe, it, expect } from 'vitest';
import { generateBioAlerts } from '../src/utils/bio_alerts.js';

describe('generateBioAlerts()', () => {
  it('returns empty array when all metrics are healthy', () => {
    const alerts = generateBioAlerts({ avg_sleep: 8, avg_energy: 7, avg_mood: 7, avg_exercise: 30 });
    expect(alerts).toEqual([]);
  });

  it('generates sleep warning when avg_sleep < 6 but >= 5', () => {
    const alerts = generateBioAlerts({ avg_sleep: 5.5, avg_energy: 7, avg_mood: 7, avg_exercise: 30 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('sleep');
    expect(alerts[0].severity).toBe('warning');
    expect(alerts[0].message).toContain('5.5h');
  });

  it('generates sleep critical when avg_sleep < 5', () => {
    const alerts = generateBioAlerts({ avg_sleep: 4, avg_energy: 7, avg_mood: 7, avg_exercise: 30 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe('critical');
  });

  it('generates energy warning when avg_energy < 4 but >= 3', () => {
    const alerts = generateBioAlerts({ avg_sleep: 8, avg_energy: 3.5, avg_mood: 7, avg_exercise: 30 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('energy');
    expect(alerts[0].severity).toBe('warning');
  });

  it('generates energy critical when avg_energy < 3', () => {
    const alerts = generateBioAlerts({ avg_sleep: 8, avg_energy: 2, avg_mood: 7, avg_exercise: 30 });
    expect(alerts[0].severity).toBe('critical');
  });

  it('generates mood warning when avg_mood < 4 but >= 3', () => {
    const alerts = generateBioAlerts({ avg_sleep: 8, avg_energy: 7, avg_mood: 3.5, avg_exercise: 30 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('mood');
    expect(alerts[0].severity).toBe('warning');
  });

  it('generates mood critical when avg_mood < 3', () => {
    const alerts = generateBioAlerts({ avg_sleep: 8, avg_energy: 7, avg_mood: 2, avg_exercise: 30 });
    expect(alerts[0].severity).toBe('critical');
  });

  it('generates exercise info when avg_exercise < 10', () => {
    const alerts = generateBioAlerts({ avg_sleep: 8, avg_energy: 7, avg_mood: 7, avg_exercise: 5 });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe('exercise');
    expect(alerts[0].severity).toBe('info');
  });

  it('generates multiple alerts when all metrics are bad', () => {
    const alerts = generateBioAlerts({ avg_sleep: 4, avg_energy: 2, avg_mood: 2, avg_exercise: 0 });
    expect(alerts).toHaveLength(4);
    expect(alerts.map(a => a.type)).toEqual(['sleep', 'energy', 'mood', 'exercise']);
  });

  it('does not alert at exact threshold boundaries (sleep=6, energy=4, mood=4, exercise=10)', () => {
    const alerts = generateBioAlerts({ avg_sleep: 6, avg_energy: 4, avg_mood: 4, avg_exercise: 10 });
    expect(alerts).toEqual([]);
  });

  it('alerts just below thresholds', () => {
    const alerts = generateBioAlerts({ avg_sleep: 5.9, avg_energy: 3.9, avg_mood: 3.9, avg_exercise: 9 });
    expect(alerts).toHaveLength(4);
  });

  it('includes metric values in alert messages', () => {
    const alerts = generateBioAlerts({ avg_sleep: 4.5, avg_energy: 2.5, avg_mood: 2.5, avg_exercise: 3 });
    expect(alerts[0].message).toContain('4.5h');
    expect(alerts[1].message).toContain('2.5/10');
    expect(alerts[2].message).toContain('2.5/10');
    expect(alerts[3].message).toContain('3 min/dia');
  });
});
