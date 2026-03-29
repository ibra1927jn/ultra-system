// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Freelance Scraper (P5: Oportunidades)    ║
// ║  Fuentes: Freelancer.com RSS + scrape directo            ║
// ╚══════════════════════════════════════════════════════════╝

const cheerio = require('cheerio');
const db = require('./db');
const telegram = require('./telegram');

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
 * Scrapea proyectos de Freelancer.com via busqueda directa
 * Usa cheerio para parsear la pagina de resultados
 */
async function scrapeFreelancer(query, category = 'freelance') {
  const encoded = encodeURIComponent(query);
  const url = `https://www.freelancer.com/jobs/?keyword=${encoded}&sort=latest`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(20000),
    });

    if (!response.ok) {
      console.error(`❌ Freelancer HTTP ${response.status} para "${query}"`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const projects = [];

    // Selectores de Freelancer.com — pagina de resultados de busqueda
    $('.JobSearchCard-item, .project-list-item, [data-project-card]').each((i, el) => {
      const titleEl = $(el).find('.JobSearchCard-primary-heading a, .project-title a, h3 a').first();
      const title = titleEl.text().trim();
      const href = titleEl.attr('href') || '';
      const fullUrl = href.startsWith('http') ? href : `https://www.freelancer.com${href}`;

      const budgetEl = $(el).find('.JobSearchCard-primary-price, .budget, [data-budget]').first();
      const budget = budgetEl.text().trim().replace(/\s+/g, ' ');

      const descEl = $(el).find('.JobSearchCard-primary-description, .project-description, p').first();
      const description = descEl.text().trim().substring(0, 500);

      const skillEls = $(el).find('.JobSearchCard-primary-tags a, .skill-tag, .tag-text');
      const skills = [];
      skillEls.each((j, s) => { skills.push($(s).text().trim()); });

      if (title && fullUrl) {
        const score = scoreProject(title, description, skills);
        projects.push({ title, url: fullUrl, budget, description, skills, category, score });
      }
    });

    return projects;
  } catch (err) {
    console.error(`❌ Freelancer scrape error ("${query}"):`, err.message);
    return [];
  }
}

/**
 * Calcula score de relevancia basado en skills de Allan
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

/**
 * Scrapea todas las categorias y guarda en DB
 */
async function fetchAll() {
  const searches = [
    { query: 'react typescript node api', category: 'web-dev' },
    { query: 'python fastapi automation bot', category: 'python' },
    { query: 'supabase firebase postgresql backend', category: 'backend' },
    { query: 'react native mobile pwa capacitor', category: 'mobile' },
    { query: 'three.js 3d opengl webgl game engine', category: '3d-graphics' },
    { query: 'web scraping automation dashboard', category: 'automation' },
  ];

  let totalNew = 0;
  const highScoreProjects = [];

  for (const search of searches) {
    const projects = await scrapeFreelancer(search.query, search.category);

    for (const project of projects) {
      try {
        const exists = await db.queryOne(
          'SELECT id FROM opportunities WHERE url = $1',
          [project.url]
        );

        if (!exists) {
          await db.queryOne(
            `INSERT INTO opportunities (title, source, url, category, status, notes)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING *`,
            [
              project.title,
              'Freelancer.com',
              project.url,
              search.category,
              'new',
              `Budget: ${project.budget || 'N/A'} | Score: ${project.score} | Skills: ${project.skills.join(', ')}`,
            ]
          );
          totalNew++;

          if (project.score >= 15) {
            highScoreProjects.push(project);
          }
        }
      } catch (err) {
        // Duplicados u otros errores — continuar
        if (!err.message.includes('duplicate')) {
          console.error(`⚠️ Error guardando proyecto:`, err.message);
        }
      }
    }

    // Rate limiting — esperar entre categorias
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Notificar proyectos de alto score via Telegram
  if (highScoreProjects.length > 0) {
    const lines = [
      '🎯 *ULTRA SYSTEM — Oportunidades Freelance*',
      '━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
    ];

    for (const p of highScoreProjects.slice(0, 5)) {
      lines.push(`⭐ *${p.title}*`);
      lines.push(`   💰 ${p.budget || 'N/A'} | 📊 Score: ${p.score}`);
      lines.push(`   🔗 ${p.url}`);
      lines.push('');
    }

    if (highScoreProjects.length > 5) {
      lines.push(`... y ${highScoreProjects.length - 5} mas`);
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
    await telegram.sendAlert(lines.join('\n'));
  }

  console.log(`🎯 Freelancer: ${totalNew} nuevas oportunidades (${highScoreProjects.length} de alto score)`);
  return { totalNew, highScoreProjects };
}

module.exports = { scrapeFreelancer, fetchAll, scoreProject };
