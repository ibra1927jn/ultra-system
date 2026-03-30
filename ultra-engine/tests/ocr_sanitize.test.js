import { describe, it, expect } from 'vitest';

/**
 * Tests for OCR file name sanitization logic from ocr.js saveFile.
 */
function sanitizeFilename(originalName) {
  return originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
}

describe('OCR filename sanitization', () => {
  it('keeps alphanumeric characters', () => {
    expect(sanitizeFilename('file123.pdf')).toBe('file123.pdf');
  });

  it('keeps dots, hyphens, and underscores', () => {
    expect(sanitizeFilename('my-file_v2.0.pdf')).toBe('my-file_v2.0.pdf');
  });

  it('replaces spaces with underscores', () => {
    expect(sanitizeFilename('my file name.pdf')).toBe('my_file_name.pdf');
  });

  it('replaces special characters', () => {
    expect(sanitizeFilename('doc (1) [final].pdf')).toBe('doc__1___final_.pdf');
  });

  it('replaces unicode/accented characters', () => {
    expect(sanitizeFilename('résumé.pdf')).toBe('r_sum_.pdf');
  });

  it('handles empty string', () => {
    expect(sanitizeFilename('')).toBe('');
  });

  it('replaces path separators', () => {
    expect(sanitizeFilename('path/to/file.pdf')).toBe('path_to_file.pdf');
  });

  it('replaces dollar signs and ampersands', () => {
    expect(sanitizeFilename('$100&more.txt')).toBe('_100_more.txt');
  });
});
