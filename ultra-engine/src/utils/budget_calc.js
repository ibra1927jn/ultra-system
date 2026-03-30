/**
 * Calculates daily burn rate and runway from income/expense data.
 * Pure function — no DB or date side effects when date is provided.
 */
function calculateRunway(income, expense, dayOfMonth) {
  const remaining = income - expense;
  const dailyBurn = dayOfMonth > 0 ? expense / dayOfMonth : 0;
  const runway = dailyBurn > 0
    ? Math.floor(remaining / dailyBurn)
    : remaining > 0 ? 999 : 0;
  return { remaining, dailyBurn, runway };
}

/**
 * SQL query: categories exceeding 80% of their budget limit for a given month.
 * Expects $1 = month string (YYYY-MM).
 */
const BUDGET_ALERTS_SQL = `SELECT
  b.category,
  b.monthly_limit,
  COALESCE(SUM(f.amount), 0) as spent,
  ROUND((COALESCE(SUM(f.amount), 0) / b.monthly_limit * 100)::numeric, 1) as percent_used
FROM budgets b
LEFT JOIN finances f ON LOWER(f.category) = LOWER(b.category)
  AND f.type = 'expense'
  AND TO_CHAR(f.date, 'YYYY-MM') = $1
GROUP BY b.category, b.monthly_limit
HAVING COALESCE(SUM(f.amount), 0) >= b.monthly_limit * 0.8
ORDER BY percent_used DESC`;

/**
 * SQL query: total income for a given month. Expects $1 = month string (YYYY-MM).
 */
const INCOME_TOTAL_SQL = `SELECT COALESCE(SUM(amount), 0) as total FROM finances
     WHERE type = 'income' AND TO_CHAR(date, 'YYYY-MM') = $1`;

/**
 * SQL query: total expenses for a given month. Expects $1 = month string (YYYY-MM).
 */
const EXPENSE_TOTAL_SQL = `SELECT COALESCE(SUM(amount), 0) as total FROM finances
     WHERE type = 'expense' AND TO_CHAR(date, 'YYYY-MM') = $1`;

module.exports = { calculateRunway, BUDGET_ALERTS_SQL, INCOME_TOTAL_SQL, EXPENSE_TOTAL_SQL };
