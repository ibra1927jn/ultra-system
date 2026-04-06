import { describe, it, expect } from 'vitest';
import { formatRssAlert } from '../src/utils/rss_format.js';

describe('formatRssAlert()', () => {
  it('formats a single article', () => {
    const articles = [{
      title: 'NZ Immigration Update',
      score: 9,
      feed: 'NZ Herald',
      url: 'https://example.com/article-1',
    }];
    const lines = formatRssAlert(articles);
    const text = lines.join('\n');

    expect(text).toContain('Noticias Relevantes');
    expect(text).toContain('⭐ *NZ Immigration Update*');
    expect(text).toContain('Score: 9');
    expect(text).toContain('📰 NZ Herald');
    expect(text).toContain('https://example.com/article-1');
  });

  it('limits to 5 articles and shows overflow count', () => {
    const articles = Array.from({ length: 8 }, (_, i) => ({
      title: `Article ${i + 1}`,
      score: 10 - i,
      feed: 'Feed',
      url: `https://example.com/${i}`,
    }));
    const lines = formatRssAlert(articles);
    const text = lines.join('\n');

    expect(text).toContain('*Article 1*');
    expect(text).toContain('*Article 5*');
    expect(text).not.toContain('*Article 6*');
    expect(text).toContain('... y 3 mas');
  });

  it('does not show overflow for exactly 5 articles', () => {
    const articles = Array.from({ length: 5 }, (_, i) => ({
      title: `Article ${i + 1}`,
      score: 8,
      feed: 'Feed',
      url: `https://example.com/${i}`,
    }));
    const lines = formatRssAlert(articles);
    const text = lines.join('\n');

    expect(text).not.toContain('... y');
  });

  it('handles empty array', () => {
    const lines = formatRssAlert([]);
    const text = lines.join('\n');

    expect(text).toContain('Noticias Relevantes');
    expect(text).not.toContain('⭐');
    expect(text).not.toContain('... y');
  });

  it('includes header and footer separators', () => {
    const lines = formatRssAlert([{
      title: 'Test',
      score: 10,
      feed: 'Feed',
      url: 'https://example.com',
    }]);

    expect(lines[0]).toContain('Noticias Relevantes');
    expect(lines[1]).toContain('━━━━━━━━━━━━━━━━━━━━━━━━');
    expect(lines[lines.length - 1]).toContain('━━━━━━━━━━━━━━━━━━━━━━━━');
  });
});
