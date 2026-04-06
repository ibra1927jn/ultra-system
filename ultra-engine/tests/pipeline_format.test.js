import { describe, it, expect } from 'vitest';
import {
  STATUS_EMOJI,
  pipelineBar,
  calculateWinRate,
  formatPipelineMessage,
  formatOpportunitiesList,
} from '../src/utils/pipeline_format.js';

describe('STATUS_EMOJI', () => {
  it('maps known statuses to emojis', () => {
    expect(STATUS_EMOJI.new).toBe('🆕');
    expect(STATUS_EMOJI.contacted).toBe('📧');
    expect(STATUS_EMOJI.applied).toBe('📨');
  });
});

describe('pipelineBar()', () => {
  it('returns empty string when total is 0', () => {
    expect(pipelineBar(5, 0, 20)).toBe('');
  });

  it('returns minimum 1 char for non-zero value', () => {
    expect(pipelineBar(1, 100, 20)).toBe('█');
  });

  it('returns full bar when value equals total', () => {
    expect(pipelineBar(10, 10, 20)).toBe('█'.repeat(20));
  });

  it('returns proportional bar', () => {
    expect(pipelineBar(5, 10, 20)).toBe('█'.repeat(10));
  });

  it('rounds to nearest integer length', () => {
    // 3/10 * 20 = 6
    expect(pipelineBar(3, 10, 20)).toBe('█'.repeat(6));
  });

  it('handles zero value with non-zero total', () => {
    // 0/10 * 20 = 0, but Math.max(1, ...) = 1
    expect(pipelineBar(0, 10, 20)).toBe('█');
  });

  it('works with different maxLength', () => {
    expect(pipelineBar(5, 10, 10)).toBe('█'.repeat(5));
  });
});

describe('calculateWinRate()', () => {
  it('returns 0 when total is 0', () => {
    expect(calculateWinRate(0, 0)).toBe(0);
  });

  it('calculates percentage correctly', () => {
    expect(calculateWinRate(3, 10)).toBe(30);
  });

  it('rounds to nearest integer', () => {
    expect(calculateWinRate(1, 3)).toBe(33);
  });

  it('returns 100 when all are won', () => {
    expect(calculateWinRate(10, 10)).toBe(100);
  });

  it('returns 0 when none are won', () => {
    expect(calculateWinRate(0, 10)).toBe(0);
  });
});

describe('formatPipelineMessage()', () => {
  it('formats basic pipeline with all statuses', () => {
    const statusMap = { new: 5, contacted: 3, applied: 2, rejected: 1, won: 1 };
    const lines = formatPipelineMessage(statusMap, 12, []);
    const text = lines.join('\n');

    expect(text).toContain('Pipeline');
    expect(text).toContain('Total: 12 oportunidades');
    expect(text).toContain('Nuevas:');
    expect(text).toContain('Contactadas:');
    expect(text).toContain('Aplicadas:');
    expect(text).toContain('Rechazadas:');
    expect(text).toContain('Ganadas:');
    expect(text).toContain('Win rate: 8%');
  });

  it('handles empty pipeline (total 0)', () => {
    const statusMap = {};
    const lines = formatPipelineMessage(statusMap, 0, []);
    const text = lines.join('\n');

    expect(text).toContain('Total: 0 oportunidades');
    expect(text).toContain('Win rate: 0%');
  });

  it('includes follow-ups when present', () => {
    const statusMap = { new: 1, contacted: 1, applied: 0, rejected: 0, won: 0 };
    const followUps = [{ title: 'Project Alpha' }, { title: 'Project Beta' }];
    const lines = formatPipelineMessage(statusMap, 2, followUps);
    const text = lines.join('\n');

    expect(text).toContain('follow-up');
    expect(text).toContain('Project Alpha');
    expect(text).toContain('Project Beta');
  });

  it('omits follow-up section when empty', () => {
    const lines = formatPipelineMessage({ new: 1 }, 1, []);
    const text = lines.join('\n');
    expect(text).not.toContain('follow-up');
  });

  it('defaults missing statuses to 0', () => {
    const lines = formatPipelineMessage({ won: 5 }, 5, []);
    const text = lines.join('\n');
    expect(text).toContain('Win rate: 100%');
    expect(text).toContain('Nuevas:');
  });
});

describe('formatOpportunitiesList()', () => {
  it('formats opportunities with all fields', () => {
    const opps = [{
      title: 'Full Stack Dev',
      source: 'LinkedIn',
      status: 'new',
      deadline: '2026-05-01',
      category: 'employment',
    }];
    const lines = formatOpportunitiesList(opps);
    const text = lines.join('\n');

    expect(text).toContain('Oportunidades');
    expect(text).toContain('🆕');
    expect(text).toContain('*Full Stack Dev*');
    expect(text).toContain('📍 LinkedIn');
    expect(text).toContain('🏷️ employment');
    expect(text).toContain('2026-05-01');
  });

  it('omits source line when null', () => {
    const opps = [{ title: 'Test', source: null, status: 'new', deadline: null, category: null }];
    const lines = formatOpportunitiesList(opps);
    const text = lines.join('\n');
    expect(text).not.toContain('📍');
  });

  it('omits category line when null', () => {
    const opps = [{ title: 'Test', source: null, status: 'new', deadline: null, category: null }];
    const lines = formatOpportunitiesList(opps);
    const text = lines.join('\n');
    expect(text).not.toContain('🏷️');
  });

  it('omits deadline when null', () => {
    const opps = [{ title: 'Test', source: null, status: 'contacted', deadline: null, category: 'freelance' }];
    const lines = formatOpportunitiesList(opps);
    const text = lines.join('\n');
    expect(text).toContain('🏷️ freelance');
    expect(text).not.toContain('(');
  });

  it('uses fallback emoji for unknown status', () => {
    const opps = [{ title: 'Test', source: null, status: 'unknown_status', deadline: null, category: null }];
    const lines = formatOpportunitiesList(opps);
    const text = lines.join('\n');
    expect(text).toContain('📌');
  });

  it('formats multiple opportunities', () => {
    const opps = [
      { title: 'Opp A', source: 'Src A', status: 'new', deadline: null, category: null },
      { title: 'Opp B', source: null, status: 'applied', deadline: '2026-06-01', category: 'dev' },
    ];
    const lines = formatOpportunitiesList(opps);
    const text = lines.join('\n');
    expect(text).toContain('*Opp A*');
    expect(text).toContain('*Opp B*');
    expect(text).toContain('🆕');
    expect(text).toContain('📨');
  });
});
