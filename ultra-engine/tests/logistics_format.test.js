import { describe, it, expect } from 'vitest';
import {
  URGENCY_EMOJI,
  formatDaysUntilLabel,
  formatLogistica7d,
  formatProximas48h,
} from '../src/utils/logistics_format.js';

describe('URGENCY_EMOJI', () => {
  it('maps days to urgency emojis', () => {
    expect(URGENCY_EMOJI[0]).toBe('🔴');
    expect(URGENCY_EMOJI[1]).toBe('🟡');
    expect(URGENCY_EMOJI[2]).toBe('🟢');
  });
});

describe('formatDaysUntilLabel()', () => {
  it('returns HOY for 0 days', () => {
    expect(formatDaysUntilLabel(0)).toBe('HOY');
  });

  it('returns MANANA for 1 day', () => {
    expect(formatDaysUntilLabel(1)).toBe('MANANA');
  });

  it('returns "en N dias" for 2+ days', () => {
    expect(formatDaysUntilLabel(2)).toBe('en 2 dias');
    expect(formatDaysUntilLabel(7)).toBe('en 7 dias');
    expect(formatDaysUntilLabel(30)).toBe('en 30 dias');
  });
});

describe('formatLogistica7d()', () => {
  it('formats items with all fields', () => {
    const items = [{
      type: 'transport',
      title: 'Flight to AKL',
      date: '2026-04-08',
      location: 'Auckland Airport',
      status: 'confirmed',
      days_until: 2,
    }];
    const lines = formatLogistica7d(items);
    const text = lines.join('\n');

    expect(text).toContain('Logistica (7 dias)');
    expect(text).toContain('🚌');
    expect(text).toContain('✅');
    expect(text).toContain('*Flight to AKL*');
    expect(text).toContain('2026-04-08');
    expect(text).toContain('en 2 dias');
    expect(text).toContain('📍 Auckland Airport');
  });

  it('omits location when null', () => {
    const items = [{
      type: 'appointment',
      title: 'Meeting',
      date: '2026-04-07',
      location: null,
      status: 'pending',
      days_until: 1,
    }];
    const lines = formatLogistica7d(items);
    const text = lines.join('\n');

    expect(text).not.toContain('📍');
    expect(text).toContain('⏳');
  });

  it('uses fallback emoji for unknown type', () => {
    const items = [{
      type: 'unknown',
      title: 'Something',
      date: '2026-04-10',
      location: null,
      status: 'confirmed',
      days_until: 4,
    }];
    const lines = formatLogistica7d(items);
    const text = lines.join('\n');
    expect(text).toContain('📌');
  });

  it('formats multiple items', () => {
    const items = [
      { type: 'visa', title: 'Visa App', date: '2026-04-07', location: 'Embassy', status: 'confirmed', days_until: 1 },
      { type: 'accommodation', title: 'Check-in', date: '2026-04-09', location: null, status: 'pending', days_until: 3 },
    ];
    const lines = formatLogistica7d(items);
    const text = lines.join('\n');
    expect(text).toContain('*Visa App*');
    expect(text).toContain('*Check-in*');
    expect(text).toContain('🛂');
    expect(text).toContain('🏠');
  });
});

describe('formatProximas48h()', () => {
  it('formats items with urgency indicators', () => {
    const items = [{
      type: 'transport',
      title: 'Bus to WLG',
      date: '2026-04-06',
      location: 'Bus Station',
      status: 'confirmed',
      days_until: 0,
    }];
    const lines = formatProximas48h(items);
    const text = lines.join('\n');

    expect(text).toContain('Proximas 48h');
    expect(text).toContain('🔴');
    expect(text).toContain('HOY');
    expect(text).toContain('🚌');
    expect(text).toContain('✅');
    expect(text).toContain('*Bus to WLG*');
    expect(text).toContain('📍 Bus Station');
  });

  it('shows yellow urgency for tomorrow', () => {
    const items = [{
      type: 'appointment',
      title: 'Doctor',
      date: '2026-04-07',
      location: null,
      status: 'pending',
      days_until: 1,
    }];
    const lines = formatProximas48h(items);
    const text = lines.join('\n');

    expect(text).toContain('🟡');
    expect(text).toContain('MANANA');
    expect(text).toContain('⏳');
  });

  it('shows green urgency for day after tomorrow', () => {
    const items = [{
      type: 'accommodation',
      title: 'Hotel Check-in',
      date: '2026-04-08',
      location: 'Hilton',
      status: 'confirmed',
      days_until: 2,
    }];
    const lines = formatProximas48h(items);
    const text = lines.join('\n');

    expect(text).toContain('🟢');
    expect(text).toContain('en 2 dias');
  });

  it('falls back to green for days_until > 2', () => {
    const items = [{
      type: 'transport',
      title: 'Train',
      date: '2026-04-10',
      location: null,
      status: 'confirmed',
      days_until: 4,
    }];
    const lines = formatProximas48h(items);
    const text = lines.join('\n');
    expect(text).toContain('🟢');
  });

  it('omits location when null', () => {
    const items = [{
      type: 'visa',
      title: 'Visa Pickup',
      date: '2026-04-06',
      location: null,
      status: 'confirmed',
      days_until: 0,
    }];
    const lines = formatProximas48h(items);
    const text = lines.join('\n');
    expect(text).not.toContain('📍');
  });
});
