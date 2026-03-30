import { describe, it, expect } from 'vitest';
import {
  bar,
  formatBudgetAlert,
  formatOpportunityReminders,
  formatLogisticsNext48h,
  formatBioWeeklySummary,
} from '../src/utils/scheduler_format.js';

describe('bar() progress renderer', () => {
  it('renders full bar for 10', () => expect(bar(10)).toBe('██████████'));
  it('renders empty bar for 0', () => expect(bar(0)).toBe('░░░░░░░░░░'));
  it('renders half for 5', () => expect(bar(5)).toBe('█████░░░░░'));
  it('clamps negative to empty', () => expect(bar(-3)).toBe('░░░░░░░░░░'));
  it('clamps >10 to full', () => expect(bar(15)).toBe('██████████'));
  it('handles string input', () => expect(bar('7')).toBe('███████░░░'));
});

describe('formatBudgetAlert()', () => {
  it('includes header and month/remaining/runway', () => {
    const lines = formatBudgetAlert({
      month: '2026-03',
      remaining: 500.50,
      runway: 15,
      alerts: [{ category: 'food', spent: '400', monthly_limit: '500', percent_used: '80.0' }],
    });
    const text = lines.join('\n');
    expect(text).toContain('Alerta de Presupuesto');
    expect(text).toContain('2026-03');
    expect(text).toContain('$500.50');
    expect(text).toContain('15 dias');
  });

  it('uses red emoji for 100%+ used', () => {
    const lines = formatBudgetAlert({
      month: '2026-03',
      remaining: -50,
      runway: 0,
      alerts: [{ category: 'rent', spent: '1200', monthly_limit: '1000', percent_used: '120.0' }],
    });
    expect(lines.join('\n')).toContain('🔴');
  });

  it('uses yellow emoji for <100% used', () => {
    const lines = formatBudgetAlert({
      month: '2026-03',
      remaining: 200,
      runway: 10,
      alerts: [{ category: 'food', spent: '400', monthly_limit: '500', percent_used: '80.0' }],
    });
    expect(lines.join('\n')).toContain('🟡');
  });

  it('formats multiple alert categories', () => {
    const lines = formatBudgetAlert({
      month: '2026-03',
      remaining: 100,
      runway: 5,
      alerts: [
        { category: 'food', spent: '400', monthly_limit: '500', percent_used: '80.0' },
        { category: 'transport', spent: '250', monthly_limit: '200', percent_used: '125.0' },
      ],
    });
    const text = lines.join('\n');
    expect(text).toContain('food');
    expect(text).toContain('transport');
    expect(text).toContain('🟡'); // food 80%
    expect(text).toContain('🔴'); // transport 125%
  });
});

describe('formatOpportunityReminders()', () => {
  it('formats deadlines with urgency levels', () => {
    const lines = formatOpportunityReminders({
      deadlines: [
        { days_until: 0, title: 'Today Job' },
        { days_until: 1, title: 'Tomorrow Job' },
        { days_until: 2, title: 'Day After Job' },
      ],
      followUps: [],
    });
    const text = lines.join('\n');
    expect(text).toContain('🔴 HOY');
    expect(text).toContain('🟡 MANANA');
    expect(text).toContain('🟢 en 2 dias');
    expect(text).toContain('Today Job');
  });

  it('formats follow-ups with source', () => {
    const lines = formatOpportunityReminders({
      deadlines: [],
      followUps: [
        { title: 'React Gig', days_since: 10, source: 'Freelancer.com' },
        { title: 'API Work', days_since: 14, source: null },
      ],
    });
    const text = lines.join('\n');
    expect(text).toContain('React Gig');
    expect(text).toContain('10 dias sin respuesta');
    expect(text).toContain('📍 Freelancer.com');
    expect(text).not.toContain('📍 null');
  });

  it('includes both sections when both have data', () => {
    const lines = formatOpportunityReminders({
      deadlines: [{ days_until: 1, title: 'D' }],
      followUps: [{ title: 'F', days_since: 8, source: null }],
    });
    const text = lines.join('\n');
    expect(text).toContain('Deadlines proximos');
    expect(text).toContain('Necesitan follow-up');
  });
});

describe('formatLogisticsNext48h()', () => {
  it('maps known types to correct emoji', () => {
    const items = [
      { type: 'transport', title: 'Bus', days_until: 0, status: 'pending', location: null },
      { type: 'accommodation', title: 'Hotel', days_until: 1, status: 'confirmed', location: 'Auckland' },
      { type: 'visa', title: 'Visa', days_until: 2, status: 'pending', location: null },
      { type: 'appointment', title: 'Doc', days_until: 0, status: 'pending', location: null },
    ];
    const text = formatLogisticsNext48h(items).join('\n');
    expect(text).toContain('🚌');
    expect(text).toContain('🏠');
    expect(text).toContain('🛂');
    expect(text).toContain('📋');
  });

  it('uses fallback emoji for unknown types', () => {
    const items = [{ type: 'other', title: 'X', days_until: 0, status: 'pending', location: null }];
    expect(formatLogisticsNext48h(items).join('\n')).toContain('📌');
  });

  it('shows confirmed status icon', () => {
    const items = [{ type: 'transport', title: 'Bus', days_until: 1, status: 'confirmed', location: null }];
    expect(formatLogisticsNext48h(items).join('\n')).toContain('✅');
  });

  it('shows pending status icon', () => {
    const items = [{ type: 'transport', title: 'Bus', days_until: 1, status: 'pending', location: null }];
    expect(formatLogisticsNext48h(items).join('\n')).toContain('⏳');
  });

  it('includes location when present', () => {
    const items = [{ type: 'transport', title: 'Bus', days_until: 0, status: 'pending', location: 'Wellington' }];
    expect(formatLogisticsNext48h(items).join('\n')).toContain('📍 Wellington');
  });

  it('omits location line when null', () => {
    const items = [{ type: 'transport', title: 'Bus', days_until: 0, status: 'pending', location: null }];
    expect(formatLogisticsNext48h(items).join('\n')).not.toContain('📍');
  });
});

describe('formatBioWeeklySummary()', () => {
  const baseWeekly = { entries: 5, avg_sleep: '7.5', avg_energy: '6.0', avg_mood: '7.0', avg_exercise: '25' };

  it('includes header and basic stats', () => {
    const text = formatBioWeeklySummary({ weekly: baseWeekly, correlations: null }).join('\n');
    expect(text).toContain('Bio Resumen Semanal');
    expect(text).toContain('5/7');
    expect(text).toContain('7.5h');
    expect(text).toContain('6.0/10');
    expect(text).toContain('25 min/dia');
  });

  it('includes progress bars for energy and mood', () => {
    const text = formatBioWeeklySummary({ weekly: baseWeekly, correlations: null }).join('\n');
    expect(text).toContain('██████░░░░'); // energy 6
    expect(text).toContain('███████░░░'); // mood 7
  });

  it('adds low sleep warning when < 6h', () => {
    const weekly = { ...baseWeekly, avg_sleep: '5.0' };
    const text = formatBioWeeklySummary({ weekly, correlations: null }).join('\n');
    expect(text).toContain('Sueno bajo (5h)');
  });

  it('adds low energy warning when < 4', () => {
    const weekly = { ...baseWeekly, avg_energy: '3.0' };
    const text = formatBioWeeklySummary({ weekly, correlations: null }).join('\n');
    expect(text).toContain('Energia baja');
  });

  it('adds low mood warning when < 4', () => {
    const weekly = { ...baseWeekly, avg_mood: '3.0' };
    const text = formatBioWeeklySummary({ weekly, correlations: null }).join('\n');
    expect(text).toContain('Animo bajo');
  });

  it('does not add warnings when metrics are healthy', () => {
    const text = formatBioWeeklySummary({ weekly: baseWeekly, correlations: null }).join('\n');
    expect(text).not.toContain('⚠️');
  });

  it('includes correlations when provided', () => {
    const corrs = [
      { label: 'Sueno → Energia', val: 0.85 },
      { label: 'Sueno → Animo', val: -0.45 },
    ];
    const text = formatBioWeeklySummary({ weekly: baseWeekly, correlations: corrs }).join('\n');
    expect(text).toContain('Correlaciones');
    expect(text).toContain('💪'); // 0.85 strong
    expect(text).toContain('↑'); // positive
    expect(text).toContain('📊'); // 0.45 moderate
    expect(text).toContain('↓'); // negative
  });

  it('skips correlations section when null', () => {
    const text = formatBioWeeklySummary({ weekly: baseWeekly, correlations: null }).join('\n');
    expect(text).not.toContain('Correlaciones');
  });

  it('skips null correlation values', () => {
    const corrs = [{ label: 'Test', val: null }];
    const text = formatBioWeeklySummary({ weekly: baseWeekly, correlations: corrs }).join('\n');
    expect(text).toContain('Correlaciones');
    expect(text).not.toContain('Test');
  });

  it('includes footer signature', () => {
    const text = formatBioWeeklySummary({ weekly: baseWeekly, correlations: null }).join('\n');
    expect(text).toContain('Ultra Engine');
  });
});
