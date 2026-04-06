/**
 * Pure formatting function for RSS high-score article alerts.
 * Extracted from scheduler.js for testability.
 */

/**
 * Format high-score RSS article alert lines.
 * @param {Array<{title: string, score: number, feed: string, url: string}>} articles
 * @returns {string[]} Formatted message lines
 */
function formatRssAlert(articles) {
  const lines = [
    '📰 *ULTRA SYSTEM — Noticias Relevantes*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];

  for (const article of articles.slice(0, 5)) {
    lines.push(`⭐ *${article.title}*`);
    lines.push(`   📊 Score: ${article.score} | 📰 ${article.feed}`);
    lines.push(`   🔗 ${article.url}`);
    lines.push('');
  }

  if (articles.length > 5) {
    lines.push(`... y ${articles.length - 5} mas`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

module.exports = { formatRssAlert };
