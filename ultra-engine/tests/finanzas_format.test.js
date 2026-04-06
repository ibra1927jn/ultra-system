import { describe, it, expect } from 'vitest';
import { formatFinanzasSummary } from '../src/utils/finanzas_format.js';

describe('formatFinanzasSummary()', () => {
  it('formats basic summary with positive balance', () => {
    const lines = formatFinanzasSummary({
      month: '2026-04',
      income: 5000,
      expense: 3000,
      topExpenses: [],
    });
    const text = lines.join('\n');

    expect(text).toContain('Finanzas');
    expect(text).toContain('2026-04');
    expect(text).toContain('$5000.00');
    expect(text).toContain('$3000.00');
    expect(text).toContain('✅');
    expect(text).toContain('$2000.00');
  });

  it('shows red emoji for negative balance', () => {
    const lines = formatFinanzasSummary({
      month: '2026-04',
      income: 2000,
      expense: 3500,
      topExpenses: [],
    });
    const text = lines.join('\n');

    expect(text).toContain('🔴');
    expect(text).toContain('$-1500.00');
  });

  it('shows green emoji for zero balance', () => {
    const lines = formatFinanzasSummary({
      month: '2026-04',
      income: 3000,
      expense: 3000,
      topExpenses: [],
    });
    const text = lines.join('\n');
    expect(text).toContain('✅');
    expect(text).toContain('$0.00');
  });

  it('includes top expenses when present', () => {
    const lines = formatFinanzasSummary({
      month: '2026-04',
      income: 5000,
      expense: 3000,
      topExpenses: [
        { category: 'Rent', total: '1500.00' },
        { category: 'Food', total: '800.50' },
      ],
    });
    const text = lines.join('\n');

    expect(text).toContain('Top gastos');
    expect(text).toContain('Rent: $1500.00');
    expect(text).toContain('Food: $800.50');
  });

  it('omits top expenses section when empty', () => {
    const lines = formatFinanzasSummary({
      month: '2026-04',
      income: 100,
      expense: 50,
      topExpenses: [],
    });
    const text = lines.join('\n');
    expect(text).not.toContain('Top gastos');
  });

  it('handles zero income and expense', () => {
    const lines = formatFinanzasSummary({
      month: '2026-01',
      income: 0,
      expense: 0,
      topExpenses: [],
    });
    const text = lines.join('\n');
    expect(text).toContain('$0.00');
    expect(text).toContain('✅');
  });

  it('formats decimal amounts correctly', () => {
    const lines = formatFinanzasSummary({
      month: '2026-04',
      income: 1234.567,
      expense: 890.123,
      topExpenses: [],
    });
    const text = lines.join('\n');
    expect(text).toContain('$1234.57');
    expect(text).toContain('$890.12');
  });

  it('parses string totals in topExpenses', () => {
    const lines = formatFinanzasSummary({
      month: '2026-04',
      income: 5000,
      expense: 2000,
      topExpenses: [{ category: 'Transport', total: '350' }],
    });
    const text = lines.join('\n');
    expect(text).toContain('Transport: $350.00');
  });
});
