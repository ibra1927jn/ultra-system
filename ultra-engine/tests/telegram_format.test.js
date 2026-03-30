import { describe, it, expect } from 'vitest';
import { formatDocumentAlert } from '../src/utils/document_format.js';

describe('formatDocumentAlert()', () => {
  it('formats a single document with correct structure', () => {
    const docs = [{
      document_name: 'Work Visa',
      document_type: 'visa',
      days_remaining: 15,
      expiry_date: '2026-04-15',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('ULTRA SYSTEM');
    expect(result).toContain('Work Visa');
    expect(result).toContain('15 dias');
    expect(result).toContain('2026-04-15');
    expect(result).toContain('🛂'); // visa emoji
    expect(result).toContain('🟡'); // 15 days = yellow
  });

  it('uses red urgency for documents expiring within 7 days', () => {
    const docs = [{
      document_name: 'Expiring Passport',
      document_type: 'pasaporte',
      days_remaining: 3,
      expiry_date: '2026-04-01',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('🔴');
    expect(result).toContain('📕'); // pasaporte emoji
  });

  it('uses green urgency for documents with >30 days', () => {
    const docs = [{
      document_name: 'Insurance',
      document_type: 'seguro',
      days_remaining: 60,
      expiry_date: '2026-06-01',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('🟢');
    expect(result).toContain('🛡️'); // seguro emoji
  });

  it('includes notes when present', () => {
    const docs = [{
      document_name: 'Car WOF',
      document_type: 'wof',
      days_remaining: 10,
      expiry_date: '2026-04-08',
      notes: 'Book at VTNZ Henderson',
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('Book at VTNZ Henderson');
    expect(result).toContain('💬');
  });

  it('omits notes line when notes is null', () => {
    const docs = [{
      document_name: 'IRD',
      document_type: 'ird',
      days_remaining: 45,
      expiry_date: '2026-05-15',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).not.toContain('💬');
  });

  it('formats multiple documents', () => {
    const docs = [
      { document_name: 'Visa', document_type: 'visa', days_remaining: 5, expiry_date: '2026-04-03', notes: null },
      { document_name: 'Rego', document_type: 'rego', days_remaining: 20, expiry_date: '2026-04-18', notes: 'AA renewal' },
    ];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('Visa');
    expect(result).toContain('Rego');
    expect(result).toContain('🔴'); // 5 days
    expect(result).toContain('🟡'); // 20 days
  });

  it('uses default emoji for unknown document types', () => {
    const docs = [{
      document_name: 'Random Doc',
      document_type: 'unknown_type',
      days_remaining: 10,
      expiry_date: '2026-04-08',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('📄'); // default emoji
  });

  it('includes footer signature', () => {
    const docs = [{
      document_name: 'Test',
      document_type: 'visa',
      days_remaining: 10,
      expiry_date: '2026-04-08',
      notes: null,
    }];
    const result = formatDocumentAlert(docs);
    expect(result).toContain('Ultra Engine');
  });
});
