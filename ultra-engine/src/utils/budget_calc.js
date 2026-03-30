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

module.exports = { calculateRunway };
