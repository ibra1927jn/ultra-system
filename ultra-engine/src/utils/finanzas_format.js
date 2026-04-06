/**
 * Pure formatting functions for financial summary display.
 * Extracted from telegram.js for testability.
 */

/**
 * Format monthly financial summary lines.
 * @param {{ month: string, income: number, expense: number, topExpenses: Array<{ category: string, total: string|number }> }} data
 * @returns {string[]} Formatted message lines
 */
function formatFinanzasSummary({ month, income, expense, topExpenses }) {
  const balance = income - expense;

  const lines = [
    '💰 *ULTRA SYSTEM — Finanzas*',
    `📅 Mes: ${month}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📈 Ingresos: $${income.toFixed(2)}`,
    `📉 Gastos: $${expense.toFixed(2)}`,
    `${balance >= 0 ? '✅' : '🔴'} Balance: $${balance.toFixed(2)}`,
  ];

  if (topExpenses.length) {
    lines.push('', '📊 Top gastos:');
    for (const cat of topExpenses) {
      lines.push(`   • ${cat.category}: $${parseFloat(cat.total).toFixed(2)}`);
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

module.exports = { formatFinanzasSummary };
