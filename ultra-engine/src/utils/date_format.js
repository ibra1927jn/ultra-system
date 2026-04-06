/**
 * Formats a date (or today) as YYYY-MM-DD string.
 * @param {Date|string|number} [date] - Date to format, defaults to now
 * @returns {string} YYYY-MM-DD
 */
function toDateStr(date) {
  return (date ? new Date(date) : new Date()).toISOString().split('T')[0];
}

// Retorna mes actual como YYYY-MM
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

module.exports = { toDateStr, currentMonth };
