import { describe, it, expect } from 'vitest';
import { formatUrgentDocumentAlert } from '../src/utils/document_format.js';

describe('formatUrgentDocumentAlert()', () => {
  it('formats a single urgent document', () => {
    const docs = [{
      document_name: 'Work Visa',
      expiry_date: '2026-04-10',
      days_remaining: 4,
    }];
    const result = formatUrgentDocumentAlert(docs);
    expect(result).toContain('ALERTA URGENTE');
    expect(result).toContain('🔴');
    expect(result).toContain('*Work Visa*');
    expect(result).toContain('4 dias');
    expect(result).toContain('2026-04-10');
  });

  it('formats multiple urgent documents', () => {
    const docs = [
      { document_name: 'Visa', expiry_date: '2026-04-07', days_remaining: 1 },
      { document_name: 'WOF', expiry_date: '2026-04-09', days_remaining: 3 },
    ];
    const result = formatUrgentDocumentAlert(docs);
    expect(result).toContain('*Visa*');
    expect(result).toContain('*WOF*');
    expect(result).toContain('1 dias');
    expect(result).toContain('3 dias');
  });

  it('handles zero days remaining', () => {
    const docs = [{
      document_name: 'Pasaporte',
      expiry_date: '2026-04-06',
      days_remaining: 0,
    }];
    const result = formatUrgentDocumentAlert(docs);
    expect(result).toContain('0 dias');
  });

  it('returns string (not array)', () => {
    const docs = [{
      document_name: 'Test',
      expiry_date: '2026-04-08',
      days_remaining: 2,
    }];
    expect(typeof formatUrgentDocumentAlert(docs)).toBe('string');
  });
});
