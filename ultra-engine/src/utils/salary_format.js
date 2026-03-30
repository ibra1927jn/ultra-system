/**
 * Formats Adzuna salary data into a readable string.
 * Returns null if no salary data available.
 */
function formatSalary(salaryMin, salaryMax) {
  if (salaryMin && salaryMax) {
    return `$${Math.round(salaryMin)}-$${Math.round(salaryMax)}`;
  }
  if (salaryMin) {
    return `From $${Math.round(salaryMin)}`;
  }
  return null;
}

module.exports = { formatSalary };
