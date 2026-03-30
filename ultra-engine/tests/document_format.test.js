import { describe, it, expect } from 'vitest';
import { TYPE_EMOJI, urgencyEmojiDoc, formatDocumentAlert } from '../src/utils/document_format.js';

describe('TYPE_EMOJI', () => {
  it('maps known document types to emojis', () => {
    expect(TYPE_EMOJI.visa).toBe('🛂');
    expect(TYPE_EMOJI.pasaporte).toBe('📕');
    expect(TYPE_EMOJI.seguro).toBe('🛡️');
    expect(TYPE_EMOJI.wof).toBe('🚗');
    expect(TYPE_EMOJI.rego).toBe('🚙');
    expect(TYPE_EMOJI.ird).toBe('💰');
    expect(TYPE_EMOJI.default).toBe('📄');
  });
});

describe('urgencyEmojiDoc()', () => {
  it('returns red for 7 days or less', () => {
    expect(urgencyEmojiDoc(0)).toBe('🔴');
    expect(urgencyEmojiDoc(1)).toBe('🔴');
    expect(urgencyEmojiDoc(7)).toBe('🔴');
  });

  it('returns yellow for 8-30 days', () => {
    expect(urgencyEmojiDoc(8)).toBe('🟡');
    expect(urgencyEmojiDoc(15)).toBe('🟡');
    expect(urgencyEmojiDoc(30)).toBe('🟡');
  });

  it('returns green for more than 30 days', () => {
    expect(urgencyEmojiDoc(31)).toBe('🟢');
    expect(urgencyEmojiDoc(365)).toBe('🟢');
  });
});

describe('formatDocumentAlert()', () => {
  it('formats a single document alert', () => {
    const docs = [{
      document_type: 'visa',
      document_name: 'Work Visa',
      days_remaining: 5,
      expiry_date: '2026-04-04',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('Alertas de Documentos');
    expect(result).toContain('🔴');
    expect(result).toContain('🛂');
    expect(result).toContain('*Work Visa*');
    expect(result).toContain('5 dias');
    expect(result).toContain('2026-04-04');
    expect(result).toContain('Ultra Engine');
  });

  it('includes notes when present', () => {
    const docs = [{
      document_type: 'pasaporte',
      document_name: 'Pasaporte ES',
      days_remaining: 20,
      expiry_date: '2026-04-19',
      notes: 'Renovar en consulado',
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('💬 Renovar en consulado');
  });

  it('omits notes line when notes is null', () => {
    const docs = [{
      document_type: 'wof',
      document_name: 'WOF Car',
      days_remaining: 60,
      expiry_date: '2026-05-29',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).not.toContain('💬');
  });

  it('uses default emoji for unknown document type', () => {
    const docs = [{
      document_type: 'unknown_type',
      document_name: 'Other Doc',
      days_remaining: 10,
      expiry_date: '2026-04-09',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('📄');
  });

  it('formats multiple documents', () => {
    const docs = [
      { document_type: 'visa', document_name: 'Visa A', days_remaining: 3, expiry_date: '2026-04-02', notes: null },
      { document_type: 'seguro', document_name: 'Seguro B', days_remaining: 45, expiry_date: '2026-05-14', notes: 'Auto-renovable' },
    ];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('*Visa A*');
    expect(result).toContain('*Seguro B*');
    expect(result).toContain('🛂');
    expect(result).toContain('🛡️');
  });
});
