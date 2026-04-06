/**
 * Pure formatting functions for pipeline/opportunity display.
 * Extracted from telegram.js for testability.
 */

const { toDateStr } = require('./date_format');

const STATUS_EMOJI = { new: '🆕', contacted: '📧', applied: '📨' };

/**
 * Proportional bar for pipeline display.
 * @param {number} value - Count for this status
 * @param {number} total - Total count
 * @param {number} maxLength - Max bar length in chars
 * @returns {string} Bar of █ chars, empty if total is 0
 */
function pipelineBar(value, total, maxLength) {
  if (total === 0) return '';
  const len = Math.max(1, Math.round(value / total * maxLength));
  return '█'.repeat(len);
}

/**
 * Win rate calculation.
 * @param {number} won - Won count
 * @param {number} total - Total count
 * @returns {number} Win rate percentage (0-100)
 */
function calculateWinRate(won, total) {
  return total > 0 ? Math.round(won / total * 100) : 0;
}

/**
 * Format pipeline message lines.
 * @param {{ new: number, contacted: number, applied: number, rejected: number, won: number }} statusMap
 * @param {number} total - Total opportunities
 * @param {Array<{ title: string }>} followUps - Follow-up items
 * @returns {string[]} Formatted message lines
 */
function formatPipelineMessage(statusMap, total, followUps) {
  const maxBar = 20;
  const b = (val) => pipelineBar(val, total, maxBar);

  const lines = [
    '🎯 *ULTRA SYSTEM — Pipeline*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `Total: ${total} oportunidades`,
    '',
    `🆕 Nuevas:      ${b(statusMap.new || 0)} ${statusMap.new || 0}`,
    `📧 Contactadas: ${b(statusMap.contacted || 0)} ${statusMap.contacted || 0}`,
    `📨 Aplicadas:   ${b(statusMap.applied || 0)} ${statusMap.applied || 0}`,
    `❌ Rechazadas:  ${b(statusMap.rejected || 0)} ${statusMap.rejected || 0}`,
    `✅ Ganadas:     ${b(statusMap.won || 0)} ${statusMap.won || 0}`,
    '',
    `📊 Win rate: ${calculateWinRate(statusMap.won || 0, total)}%`,
  ];

  if (followUps.length) {
    lines.push('', '⚠️ *Necesitan follow-up (>7 dias):*');
    for (const f of followUps) {
      lines.push(`   • ${f.title}`);
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

/**
 * Format opportunities list message lines.
 * @param {Array<{ title: string, source: string|null, status: string, deadline: string|null, category: string|null }>} opps
 * @returns {string[]} Formatted message lines
 */
function formatOpportunitiesList(opps) {
  const lines = [
    '🎯 *ULTRA SYSTEM — Oportunidades*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const o of opps) {
    const emoji = STATUS_EMOJI[o.status] || '📌';
    const deadline = o.deadline ? ` (${toDateStr(o.deadline)})` : '';
    lines.push(`${emoji} *${o.title}*`);
    if (o.source) lines.push(`   📍 ${o.source}`);
    if (o.category) lines.push(`   🏷️ ${o.category}${deadline}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

module.exports = {
  STATUS_EMOJI,
  pipelineBar,
  calculateWinRate,
  formatPipelineMessage,
  formatOpportunitiesList,
};
