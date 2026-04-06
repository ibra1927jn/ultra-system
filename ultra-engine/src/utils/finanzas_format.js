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

/**
 * Format detailed budget/presupuesto view for Telegram /presupuesto command.
 * @param {{ month: string, income: number, expense: number, remaining: number, dailyBurn: number, runway: number, budgetAlerts: Array<{ category: string, spent: string|number, monthly_limit: string|number, percent_used: string|number }> }} data
 * @returns {string[]} Formatted message lines
 */
function formatPresupuestoDetail({ month, income, expense, remaining, dailyBurn, runway, budgetAlerts }) {
  const lines = [
    '💰 *ULTRA SYSTEM — Presupuesto*',
    `📅 ${month}`,
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📈 Ingresos: $${income.toFixed(2)}`,
    `📉 Gastos: $${expense.toFixed(2)}`,
    `💵 Restante: $${remaining.toFixed(2)}`,
    '',
    `🔥 Burn diario: $${dailyBurn.toFixed(2)}/dia`,
    `⏳ Runway: ${runway} dias`,
  ];

  if (budgetAlerts.length) {
    lines.push('', '⚠️ *Categorias excediendo 80%:*');
    for (const a of budgetAlerts) {
      const emoji = parseFloat(a.percent_used) >= 100 ? '🔴' : '🟡';
      lines.push(`${emoji} ${a.category}: $${parseFloat(a.spent).toFixed(2)}/$${parseFloat(a.monthly_limit).toFixed(2)} (${a.percent_used}%)`);
    }
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

module.exports = { formatFinanzasSummary, formatPresupuestoDetail };
