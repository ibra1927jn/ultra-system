/**
 * Calcula coeficiente de correlacion de Pearson entre dos arrays
 * Retorna valor entre -1 y 1, o null si no se puede calcular
 */
function pearson(x, y) {
  const n = x.length;
  if (n < 3 || n !== y.length) return null;

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return null;

  return Math.round((numerator / denominator) * 100) / 100;
}

module.exports = { pearson };
