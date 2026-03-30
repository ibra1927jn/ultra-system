/**
 * Pure scoring logic for freelance project relevance.
 * Extracted from freelance_scraper.js for testability.
 */

// Scoring: keywords que aumentan relevancia para Allan
const SKILL_KEYWORDS = {
  // Alto valor (stack de Allan)
  'react': 8, 'typescript': 8, 'node': 7, 'python': 7, 'fastapi': 9,
  'supabase': 10, 'firebase': 7, 'postgresql': 7, 'docker': 6,
  'three.js': 9, 'opengl': 8, 'c++': 8, 'rust': 6,
  'capacitor': 9, 'pwa': 8, 'electron': 6,
  // Medio valor
  'api': 5, 'scraping': 6, 'automation': 6, 'bot': 5,
  'dashboard': 5, 'fullstack': 6, 'backend': 5, 'frontend': 5,
  // Bajo valor (pero aun relevante)
  'javascript': 4, 'html': 3, 'css': 3, 'sql': 4,
};

/**
 * Calcula score de relevancia basado en skills de Allan
 * @param {string} title - Project title
 * @param {string} description - Project description
 * @param {string[]} skills - Array of skill tags
 * @returns {number} Score 0-100
 */
function scoreProject(title, description, skills) {
  const text = `${title} ${description} ${skills.join(' ')}`.toLowerCase();
  let score = 0;

  for (const [keyword, weight] of Object.entries(SKILL_KEYWORDS)) {
    if (text.includes(keyword.toLowerCase())) {
      score += weight;
    }
  }

  return Math.min(score, 100);
}

module.exports = { SKILL_KEYWORDS, scoreProject };
