/**
 * Calcula score de relevancia para un articulo basado en keywords
 * Funcion pura: recibe keywords como parametro en vez de consultar DB
 * @param {string} title — Titulo del articulo
 * @param {string} summary — Resumen del articulo
 * @param {{keyword: string, weight: number}[]} keywords — Lista de keywords con pesos
 * @returns {number} — Score acumulado
 */
function computeArticleScore(title, summary, keywords) {
  if (!keywords || !keywords.length) return 0;

  const text = `${title || ''} ${summary || ''}`.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    if (text.includes(kw.keyword.toLowerCase())) {
      score += kw.weight;
    }
  }

  return score;
}

module.exports = { computeArticleScore };
