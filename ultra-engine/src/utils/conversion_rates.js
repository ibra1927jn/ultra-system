/**
 * Calculates pipeline conversion rates from status counts.
 * Pure function — no DB dependency.
 *
 * @param {{ contacted: number, applied: number, rejected: number, won: number }} statusMap
 * @param {number} totalCount
 * @returns {{ new_to_contacted: number, contacted_to_applied: number, applied_to_won: number, overall_win_rate: number }}
 */
function calculateConversionRates(statusMap, totalCount) {
  const { contacted = 0, applied = 0, rejected = 0, won = 0 } = statusMap;
  const progressed = contacted + applied + won;
  const decided = applied + won + rejected;

  return {
    new_to_contacted: totalCount > 0 ? Math.round(progressed / totalCount * 100) : 0,
    contacted_to_applied: progressed > 0 ? Math.round((applied + won) / progressed * 100) : 0,
    applied_to_won: decided > 0 ? Math.round(won / decided * 100) : 0,
    overall_win_rate: totalCount > 0 ? Math.round(won / totalCount * 100) : 0,
  };
}

module.exports = { calculateConversionRates };
