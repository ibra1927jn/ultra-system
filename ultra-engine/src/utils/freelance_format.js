/**
 * Pure formatting function for freelance opportunity alerts.
 * Extracted from freelance_scraper.js for testability.
 */

/**
 * Format high-score freelance project alert lines.
 * @param {Array<{title: string, budget: string, score: number, url: string}>} projects
 * @returns {string[]} Formatted message lines
 */
function formatFreelanceAlert(projects) {
  const lines = [
    '🎯 *ULTRA SYSTEM — Oportunidades Freelance*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
  ];

  for (const p of projects.slice(0, 5)) {
    lines.push(`⭐ *${p.title}*`);
    lines.push(`   💰 ${p.budget || 'N/A'} | 📊 Score: ${p.score}`);
    lines.push(`   🔗 ${p.url}`);
    lines.push('');
  }

  if (projects.length > 5) {
    lines.push(`... y ${projects.length - 5} mas`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

module.exports = { formatFreelanceAlert };
