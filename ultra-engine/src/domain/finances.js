const db = require('../db');

async function getMonthSummary(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const summary = await db.queryAll(
    `SELECT type, COUNT(*) as count, SUM(amount) as total, ARRAY_AGG(DISTINCT category) as categories
     FROM finances WHERE TO_CHAR(date, 'YYYY-MM') = $1 GROUP BY type`,
    [m]
  );
  const byCategory = await db.queryAll(
    `SELECT category, type, SUM(amount) as total, COUNT(*) as count
     FROM finances WHERE TO_CHAR(date, 'YYYY-MM') = $1 GROUP BY category, type ORDER BY total DESC`,
    [m]
  );
  const income = summary.find(r => r.type === 'income')?.total || 0;
  const expense = summary.find(r => r.type === 'expense')?.total || 0;
  return {
    month: m,
    income: parseFloat(income),
    expense: parseFloat(expense),
    balance: parseFloat(income) - parseFloat(expense),
    byCategory,
  };
}

async function getBudgetAlerts(month) {
  const m = month || new Date().toISOString().slice(0, 7);
  const alerts = await db.queryAll(
    `SELECT b.category, b.monthly_limit, COALESCE(SUM(f.amount), 0) as spent,
       ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1) as percent_used
     FROM budgets b
     LEFT JOIN finances f ON LOWER(f.category) = LOWER(b.category)
       AND f.type = 'expense' AND TO_CHAR(f.date, 'YYYY-MM') = $1
     GROUP BY b.category, b.monthly_limit
     HAVING COALESCE(SUM(f.amount), 0) >= b.monthly_limit * 0.8
     ORDER BY percent_used DESC`, [m]
  );
  return { data: alerts, count: alerts.length, threshold: '80%', month: m };
}

module.exports = { getMonthSummary, getBudgetAlerts };
