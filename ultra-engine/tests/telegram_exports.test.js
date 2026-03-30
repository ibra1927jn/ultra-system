import { describe, it, expect } from 'vitest';
import { TYPE_EMOJI, urgencyEmojiDoc } from '../src/utils/document_format.js';

describe('TYPE_EMOJI mapping', () => {
  it('maps visa to passport emoji', () => expect(TYPE_EMOJI.visa).toBe('🛂'));
  it('maps pasaporte', () => expect(TYPE_EMOJI.pasaporte).toBe('📕'));
  it('maps seguro', () => expect(TYPE_EMOJI.seguro).toBe('🛡️'));
  it('maps wof', () => expect(TYPE_EMOJI.wof).toBe('🚗'));
  it('maps rego', () => expect(TYPE_EMOJI.rego).toBe('🚙'));
  it('maps ird', () => expect(TYPE_EMOJI.ird).toBe('💰'));
  it('has default fallback', () => expect(TYPE_EMOJI.default).toBe('📄'));
  it('returns undefined for unmapped types', () => expect(TYPE_EMOJI.random).toBeUndefined());
});

describe('urgencyEmojiDoc()', () => {
  it('returns red for <= 7 days', () => {
    expect(urgencyEmojiDoc(0)).toBe('🔴');
    expect(urgencyEmojiDoc(3)).toBe('🔴');
    expect(urgencyEmojiDoc(7)).toBe('🔴');
  });

  it('returns yellow for 8-30 days', () => {
    expect(urgencyEmojiDoc(8)).toBe('🟡');
    expect(urgencyEmojiDoc(15)).toBe('🟡');
    expect(urgencyEmojiDoc(30)).toBe('🟡');
  });

  it('returns green for > 30 days', () => {
    expect(urgencyEmojiDoc(31)).toBe('🟢');
    expect(urgencyEmojiDoc(60)).toBe('🟢');
    expect(urgencyEmojiDoc(365)).toBe('🟢');
  });
});
