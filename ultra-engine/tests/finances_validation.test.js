import { describe, it, expect } from 'vitest';

/**
 * Validation logic extracted from routes/finances.js POST handler.
 */
function validateFinanceEntry({ type, amount, category }) {
  if (!type || !amount || !category) {
    return { ok: false, error: 'Faltan campos obligatorios: type, amount, category' };
  }
  if (!['income', 'expense'].includes(type)) {
    return { ok: false, error: 'type debe ser income o expense' };
  }
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return { ok: false, error: 'amount debe ser un numero positivo' };
  }
  return { ok: true, data: { type, amount: parsedAmount, category } };
}

describe('finances entry validation', () => {
  const valid = { type: 'expense', amount: 42.5, category: 'food' };

  it('accepts valid expense entry', () => {
    const result = validateFinanceEntry(valid);
    expect(result.ok).toBe(true);
    expect(result.data.amount).toBe(42.5);
  });

  it('accepts valid income entry', () => {
    const result = validateFinanceEntry({ ...valid, type: 'income' });
    expect(result.ok).toBe(true);
  });

  it('rejects missing type', () => {
    const result = validateFinanceEntry({ ...valid, type: null });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('campos obligatorios');
  });

  it('rejects missing amount', () => {
    const result = validateFinanceEntry({ ...valid, amount: null });
    expect(result.ok).toBe(false);
  });

  it('rejects missing category', () => {
    const result = validateFinanceEntry({ ...valid, category: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = validateFinanceEntry({ ...valid, type: 'transfer' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('income o expense');
  });

  it('rejects zero amount (caught by falsy check)', () => {
    const result = validateFinanceEntry({ ...valid, amount: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = validateFinanceEntry({ ...valid, amount: -10 });
    expect(result.ok).toBe(false);
  });

  it('rejects non-numeric amount', () => {
    const result = validateFinanceEntry({ ...valid, amount: 'abc' });
    expect(result.ok).toBe(false);
  });

  it('parses string amounts correctly', () => {
    const result = validateFinanceEntry({ ...valid, amount: '99.99' });
    expect(result.ok).toBe(true);
    expect(result.data.amount).toBe(99.99);
  });
});
