// Fuzzy subsequence match — O(n+m). Score por compactness y match inicial.
// No es Levenshtein; es "todas las letras de la query aparecen en orden".
// Suficiente para una palette Cmd+K con ~20 items.

export function fuzzyMatch(query: string, target: string): number | null {
  if (!query) return 1; // sin query → todo pasa
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevIdx = -2;
  let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      streak = i === prevIdx + 1 ? streak + 1 : 1;
      score += streak * 2;
      if (i === 0 || t[i - 1] === ' ' || t[i - 1] === '·') score += 5;
      prevIdx = i;
      qi++;
    }
  }
  if (qi < q.length) return null;
  // Normaliza por longitud: palabras más cortas y con match inicial puntúan mejor.
  return score / Math.max(1, t.length);
}
