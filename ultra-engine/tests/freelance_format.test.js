import { describe, it, expect } from 'vitest';
import { formatFreelanceAlert } from '../src/utils/freelance_format.js';

describe('formatFreelanceAlert()', () => {
  it('formats a single project', () => {
    const projects = [{ title: 'React App', budget: '$500-$1000', score: 20, url: 'https://example.com/1' }];
    const text = formatFreelanceAlert(projects).join('\n');
    expect(text).toContain('Oportunidades Freelance');
    expect(text).toContain('⭐ *React App*');
    expect(text).toContain('$500-$1000');
    expect(text).toContain('Score: 20');
    expect(text).toContain('https://example.com/1');
  });

  it('shows N/A when budget is empty', () => {
    const projects = [{ title: 'Job', budget: '', score: 15, url: 'https://example.com' }];
    const text = formatFreelanceAlert(projects).join('\n');
    expect(text).toContain('N/A');
  });

  it('shows N/A when budget is null', () => {
    const projects = [{ title: 'Job', budget: null, score: 15, url: 'https://example.com' }];
    const text = formatFreelanceAlert(projects).join('\n');
    expect(text).toContain('N/A');
  });

  it('limits display to 5 projects', () => {
    const projects = Array.from({ length: 7 }, (_, i) => ({
      title: `Project ${i + 1}`, budget: '$100', score: 20, url: `https://example.com/${i}`,
    }));
    const text = formatFreelanceAlert(projects).join('\n');
    expect(text).toContain('Project 1');
    expect(text).toContain('Project 5');
    expect(text).not.toContain('Project 6');
    expect(text).toContain('... y 2 mas');
  });

  it('does not show overflow message for exactly 5 projects', () => {
    const projects = Array.from({ length: 5 }, (_, i) => ({
      title: `P${i}`, budget: '$100', score: 15, url: `https://example.com/${i}`,
    }));
    const text = formatFreelanceAlert(projects).join('\n');
    expect(text).not.toContain('... y');
  });

  it('handles empty projects array', () => {
    const lines = formatFreelanceAlert([]);
    const text = lines.join('\n');
    expect(text).toContain('Oportunidades Freelance');
    expect(text).not.toContain('⭐');
    expect(text).not.toContain('... y');
  });

  it('includes header and footer separators', () => {
    const projects = [{ title: 'X', budget: '$50', score: 10, url: 'https://example.com' }];
    const lines = formatFreelanceAlert(projects);
    expect(lines[1]).toBe('━━━━━━━━━━━━━━━━━━━━━━━━');
    expect(lines[lines.length - 1]).toBe('━━━━━━━━━━━━━━━━━━━━━━━━');
  });

  it('formats multiple projects with correct structure', () => {
    const projects = [
      { title: 'A', budget: '$100', score: 25, url: 'https://a.com' },
      { title: 'B', budget: '$200', score: 18, url: 'https://b.com' },
    ];
    const text = formatFreelanceAlert(projects).join('\n');
    expect(text).toContain('*A*');
    expect(text).toContain('*B*');
    expect(text).toContain('Score: 25');
    expect(text).toContain('Score: 18');
  });
});
