/**
 * Pure formatting functions for logistics display.
 * Extracted from telegram.js for testability.
 */

const { toDateStr } = require('./date_format');
const { LOGISTICS_TYPE_EMOJI } = require('./scheduler_format');

const URGENCY_EMOJI = { 0: '🔴', 1: '🟡', 2: '🟢' };

/**
 * Format days-until label.
 * @param {number} daysUntil
 * @returns {string} Human-readable label
 */
function formatDaysUntilLabel(daysUntil) {
  if (daysUntil === 0) return 'HOY';
  if (daysUntil === 1) return 'MANANA';
  return `en ${daysUntil} dias`;
}

/**
 * Format logistics 7-day view message lines.
 * @param {Array<{ type: string, title: string, date: string, location: string|null, status: string, days_until: number }>} items
 * @returns {string[]} Formatted message lines
 */
function formatLogistica7d(items) {
  const lines = [
    '🗺️ *ULTRA SYSTEM — Logistica (7 dias)*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const item of items) {
    const emoji = LOGISTICS_TYPE_EMOJI[item.type] || '📌';
    const dateStr = toDateStr(item.date);
    const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';
    lines.push(`${emoji} ${statusIcon} *${item.title}*`);
    lines.push(`   📅 ${dateStr} (en ${item.days_until} dias)`);
    if (item.location) lines.push(`   📍 ${item.location}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

/**
 * Format logistics 48h view message lines (with urgency).
 * @param {Array<{ type: string, title: string, date: string, location: string|null, status: string, days_until: number }>} items
 * @returns {string[]} Formatted message lines
 */
function formatProximas48h(items) {
  const lines = [
    '🗺️ *ULTRA SYSTEM — Proximas 48h*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const item of items) {
    const emoji = LOGISTICS_TYPE_EMOJI[item.type] || '📌';
    const urgency = URGENCY_EMOJI[item.days_until] || '🟢';
    const dateStr = toDateStr(item.date);
    const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';
    const label = formatDaysUntilLabel(item.days_until);

    lines.push(`${urgency} ${emoji} ${statusIcon} *${item.title}*`);
    lines.push(`   📅 ${dateStr} — ${label}`);
    if (item.location) lines.push(`   📍 ${item.location}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

module.exports = {
  URGENCY_EMOJI,
  formatDaysUntilLabel,
  formatLogistica7d,
  formatProximas48h,
};
