/**
 * Pure interpretation logic for bio correlation data.
 * Extracted from routes/bio.js for testability.
 */

/**
 * Generate human-readable insights from correlation key-value pairs.
 * @param {Object} correlations - Map of "metricA_vs_metricB" to Pearson r values
 * @returns {string[]} Human-readable insight strings for moderate+ correlations
 */
function generateCorrelationInsights(correlations) {
  const insights = [];
  for (const [key, val] of Object.entries(correlations)) {
    if (val === null) continue;
    const [a, , b] = key.split('_');
    const strength = Math.abs(val) >= 0.7 ? 'fuerte' : Math.abs(val) >= 0.4 ? 'moderada' : 'debil';
    const direction = val > 0 ? 'positiva' : 'negativa';
    if (Math.abs(val) >= 0.4) {
      insights.push(`${a}/${b}: correlacion ${strength} ${direction} (${val})`);
    }
  }
  return insights;
}

module.exports = { generateCorrelationInsights };
