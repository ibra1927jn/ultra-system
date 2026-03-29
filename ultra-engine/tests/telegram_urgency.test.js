import { describe, it, expect } from 'vitest';

/**
 * Pure urgency and emoji logic extracted from telegram.js.
 * Tests document type emoji mapping and urgency thresholds.
 */

const TYPE_EMOJI = {
  visa: '🛂',
  pasaporte: '📕',
  seguro: '🛡️',
  wof: '🚗',
  rego: '🚙',
  ird: '💰',
  default: '📄',
};

function urgencyEmojiDoc(days) {
  if (days <= 7) return '🔴';
  if (days <= 30) return '🟡';
  return '🟢';
}

describe('urgencyEmojiDoc()', () => {
  it('returns red for 0 days (expired)', () => {
    expect(urgencyEmojiDoc(0)).toBe('🔴');
  });

  it('returns red for negative days (already expired)', () => {
    expect(urgencyEmojiDoc(-5)).toBe('🔴');
  });

  it('returns red for 1 day', () => {
    expect(urgencyEmojiDoc(1)).toBe('🔴');
  });

  it('returns red for exactly 7 days', () => {
    expect(urgencyEmojiDoc(7)).toBe('🔴');
  });

  it('returns yellow for 8 days', () => {
    expect(urgencyEmojiDoc(8)).toBe('🟡');
  });

  it('returns yellow for exactly 30 days', () => {
    expect(urgencyEmojiDoc(30)).toBe('🟡');
  });

  it('returns green for 31 days', () => {
    expect(urgencyEmojiDoc(31)).toBe('🟢');
  });

  it('returns green for 365 days', () => {
    expect(urgencyEmojiDoc(365)).toBe('🟢');
  });
});

describe('TYPE_EMOJI mapping', () => {
  it('maps all known document types', () => {
    expect(TYPE_EMOJI.visa).toBe('🛂');
    expect(TYPE_EMOJI.pasaporte).toBe('📕');
    expect(TYPE_EMOJI.seguro).toBe('🛡️');
    expect(TYPE_EMOJI.wof).toBe('🚗');
    expect(TYPE_EMOJI.rego).toBe('🚙');
    expect(TYPE_EMOJI.ird).toBe('💰');
  });

  it('has default emoji for unknown types', () => {
    expect(TYPE_EMOJI.default).toBe('📄');
  });

  it('returns undefined for unmapped types (fallback to default)', () => {
    const emoji = TYPE_EMOJI['licencia'] || TYPE_EMOJI.default;
    expect(emoji).toBe('📄');
  });
});
