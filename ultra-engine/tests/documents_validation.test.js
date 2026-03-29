import { describe, it, expect } from 'vitest';

/**
 * Document alert validation logic extracted from routes/documents.js POST handler.
 * Tests required field validation without Express or DB.
 */

function validateDocumentInput(body) {
  const { document_name, document_type, expiry_date } = body;
  if (!document_name || !document_type || !expiry_date) {
    return { ok: false, error: 'Faltan campos obligatorios: document_name, document_type, expiry_date' };
  }
  return { ok: true };
}

/**
 * Alert days default logic from routes/documents.js
 */
function resolveAlertDays(input) {
  return input || 60;
}

describe('document alert input validation', () => {
  it('accepts valid input with all required fields', () => {
    const result = validateDocumentInput({
      document_name: 'Work Visa',
      document_type: 'visa',
      expiry_date: '2026-12-31',
    });
    expect(result.ok).toBe(true);
  });

  it('rejects missing document_name', () => {
    const result = validateDocumentInput({
      document_type: 'visa',
      expiry_date: '2026-12-31',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('document_name');
  });

  it('rejects missing document_type', () => {
    const result = validateDocumentInput({
      document_name: 'Visa',
      expiry_date: '2026-12-31',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects missing expiry_date', () => {
    const result = validateDocumentInput({
      document_name: 'Visa',
      document_type: 'visa',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects completely empty body', () => {
    const result = validateDocumentInput({});
    expect(result.ok).toBe(false);
  });

  it('rejects empty string values', () => {
    const result = validateDocumentInput({
      document_name: '',
      document_type: 'visa',
      expiry_date: '2026-12-31',
    });
    expect(result.ok).toBe(false);
  });
});

describe('alert_days default', () => {
  it('defaults to 60 when not provided', () => {
    expect(resolveAlertDays(undefined)).toBe(60);
    expect(resolveAlertDays(null)).toBe(60);
    expect(resolveAlertDays(0)).toBe(60);
  });

  it('uses provided value when given', () => {
    expect(resolveAlertDays(30)).toBe(30);
    expect(resolveAlertDays(90)).toBe(90);
  });
});
