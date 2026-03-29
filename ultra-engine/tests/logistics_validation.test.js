import { describe, it, expect } from 'vitest';

/**
 * Validation logic extracted from routes/logistics.js POST handler.
 */
const VALID_TYPES = ['transport', 'accommodation', 'visa', 'appointment'];
const VALID_STATUSES = ['pending', 'confirmed', 'done'];

function validateLogisticsEntry({ type, title, date, status, cost }) {
  if (!type || !title || !date) {
    return { ok: false, error: 'Faltan campos obligatorios: type, title, date' };
  }
  if (!VALID_TYPES.includes(type)) {
    return { ok: false, error: 'type debe ser transport, accommodation, visa o appointment' };
  }
  const finalStatus = VALID_STATUSES.includes(status) ? status : 'pending';
  const parsedCost = parseFloat(cost) || 0;
  return { ok: true, data: { type, title, date, status: finalStatus, cost: parsedCost } };
}

describe('logistics entry validation', () => {
  const valid = { type: 'transport', title: 'Bus to Auckland', date: '2026-04-01', status: 'pending', cost: 25 };

  it('accepts valid entry', () => {
    const result = validateLogisticsEntry(valid);
    expect(result.ok).toBe(true);
    expect(result.data.type).toBe('transport');
  });

  it('accepts all valid types', () => {
    for (const type of VALID_TYPES) {
      expect(validateLogisticsEntry({ ...valid, type }).ok).toBe(true);
    }
  });

  it('rejects invalid type', () => {
    const result = validateLogisticsEntry({ ...valid, type: 'flight' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('type debe ser');
  });

  it('rejects missing title', () => {
    const result = validateLogisticsEntry({ ...valid, title: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects missing date', () => {
    const result = validateLogisticsEntry({ ...valid, date: null });
    expect(result.ok).toBe(false);
  });

  it('defaults status to pending for invalid value', () => {
    const result = validateLogisticsEntry({ ...valid, status: 'unknown' });
    expect(result.ok).toBe(true);
    expect(result.data.status).toBe('pending');
  });

  it('defaults status to pending when not provided', () => {
    const result = validateLogisticsEntry({ ...valid, status: undefined });
    expect(result.ok).toBe(true);
    expect(result.data.status).toBe('pending');
  });

  it('accepts all valid statuses', () => {
    for (const status of VALID_STATUSES) {
      const result = validateLogisticsEntry({ ...valid, status });
      expect(result.data.status).toBe(status);
    }
  });

  it('defaults cost to 0 when not provided', () => {
    const result = validateLogisticsEntry({ ...valid, cost: undefined });
    expect(result.data.cost).toBe(0);
  });

  it('parses numeric cost', () => {
    const result = validateLogisticsEntry({ ...valid, cost: '150.50' });
    expect(result.data.cost).toBe(150.5);
  });
});
