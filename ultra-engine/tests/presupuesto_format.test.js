import { describe, it, expect } from 'vitest';
import { formatPresupuestoDetail } from '../src/utils/finanzas_format.js';

describe('formatPresupuestoDetail()', () => {
  const base = {
    month: '2026-04',
    income: 5000,
    expense: 3000,
    remaining: 2000,
    dailyBurn: 200,
    runway: 10,
    budgetAlerts: [],
  };

  it('includes header and month', () => {
    const text = formatPresupuestoDetail(base).join('\n');
    expect(text).toContain('Presupuesto');
    expect(text).toContain('2026-04');
  });

  it('shows income, expenses, and remaining', () => {
    const text = formatPresupuestoDetail(base).join('\n');
    expect(text).toContain('$5000.00');
    expect(text).toContain('$3000.00');
    expect(text).toContain('$2000.00');
  });

  it('shows burn rate and runway', () => {
    const text = formatPresupuestoDetail(base).join('\n');
    expect(text).toContain('$200.00/dia');
    expect(text).toContain('10 dias');
  });

  it('includes budget alerts when present', () => {
    const data = {
      ...base,
      budgetAlerts: [
        { category: 'food', spent: '400', monthly_limit: '500', percent_used: '80.0' },
      ],
    };
    const text = formatPresupuestoDetail(data).join('\n');
    expect(text).toContain('Categorias excediendo 80%');
    expect(text).toContain('🟡');
    expect(text).toContain('food');
    expect(text).toContain('$400.00/$500.00');
  });

  it('shows red emoji for 100%+ used', () => {
    const data = {
      ...base,
      budgetAlerts: [
        { category: 'rent', spent: '1200', monthly_limit: '1000', percent_used: '120.0' },
      ],
    };
    const text = formatPresupuestoDetail(data).join('\n');
    expect(text).toContain('🔴');
  });

  it('omits budget alerts section when empty', () => {
    const text = formatPresupuestoDetail(base).join('\n');
    expect(text).not.toContain('Categorias excediendo');
  });

  it('handles negative remaining (overspent)', () => {
    const data = { ...base, remaining: -500, runway: -3 };
    const text = formatPresupuestoDetail(data).join('\n');
    expect(text).toContain('$-500.00');
    expect(text).toContain('-3 dias');
  });

  it('handles zero income and expense', () => {
    const data = { ...base, income: 0, expense: 0, remaining: 0, dailyBurn: 0, runway: 0 };
    const text = formatPresupuestoDetail(data).join('\n');
    expect(text).toContain('$0.00');
  });

  it('formats multiple budget alerts', () => {
    const data = {
      ...base,
      budgetAlerts: [
        { category: 'food', spent: '400', monthly_limit: '500', percent_used: '80.0' },
        { category: 'transport', spent: '250', monthly_limit: '200', percent_used: '125.0' },
      ],
    };
    const text = formatPresupuestoDetail(data).join('\n');
    expect(text).toContain('food');
    expect(text).toContain('transport');
    expect(text).toContain('🟡');
    expect(text).toContain('🔴');
  });

  it('returns array of strings', () => {
    const lines = formatPresupuestoDetail(base);
    expect(Array.isArray(lines)).toBe(true);
    lines.forEach(l => expect(typeof l).toBe('string'));
  });
});
