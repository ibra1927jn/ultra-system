// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Cross-pillar news bridges (B6)            ║
// ║                                                            ║
// ║  Subscribe a 'news.cpi' (publicado por rss.js cuando un    ║
// ║  feed con target_pillar trae un articulo nuevo) y rutea    ║
// ║  a Telegram según pillar_topic.                            ║
// ║                                                            ║
// ║  Diseño minimal: 1 handler genérico que mira pillar_topic  ║
// ║  + score y decide si alertar. Handlers especializados por  ║
// ║  pillar (auto-crear opp row, etc.) son enrichment futuro.  ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const eventbus = require('./eventbus');
const telegram = require('./telegram');

const SCORE_ALWAYS_ALERT = 8;

// Topics que SIEMPRE alertan (independientemente del score) por su
// criticidad operacional para Ibrahim. Lista deliberadamente CORTA: solo
// eventos raros y de alto impacto institucional. Topics ruidosos como
// layoffs/grants_*/fellowships pasan por la puerta del score (≥8) — si
// no tienen palabras clave configuradas que disparen el score, son ruido
// de baja prioridad y no merecen interrumpir.
//   - visa* → afecta a NZ WHV / movilidad
//   - boe → boletín oficial estatal (España, residencia, deudas)
//   - central_bank → decisiones de tipos (riesgo P3)
const ALWAYS_ALERT_TOPICS = new Set([
  'visa', 'visa_eu', 'visa_us',
  'boe',
  'central_bank',
]);

const PILLAR_EMOJI = {
  P2: '💼',  // jobs/empleo
  P3: '💰',  // finanzas
  P4: '🛂',  // burocracia
  P5: '🎯',  // oportunidades
};

const PILLAR_LABEL = {
  P2: 'Empleo',
  P3: 'Finanzas',
  P4: 'Burocracia',
  P5: 'Oportunidades',
};

let _initialized = false;

function shouldAlert({ score, pillar_topic }) {
  if (typeof score === 'number' && score >= SCORE_ALWAYS_ALERT) return true;
  if (pillar_topic && ALWAYS_ALERT_TOPICS.has(pillar_topic)) return true;
  return false;
}

async function onCrossPillarNews({ data }) {
  try {
    const { article_id, target_pillar, pillar_topic, title, url, score, feed_name } = data;
    if (!shouldAlert({ score, pillar_topic })) return;

    const emoji = PILLAR_EMOJI[target_pillar] || '📰';
    const label = PILLAR_LABEL[target_pillar] || target_pillar;
    const topicTag = pillar_topic ? ` · #${pillar_topic}` : '';
    const scoreTag = typeof score === 'number' && score > 0 ? ` (score=${score})` : '';

    const msg =
      `${emoji} *Cross-pillar → ${label}*${topicTag}${scoreTag}\n\n` +
      `*${title}*\n` +
      `📡 ${feed_name}\n` +
      `🔗 ${url}`;

    await telegram.sendAlert(msg);

    // Mark as notified
    if (article_id) {
      await db.query(
        `UPDATE cross_pillar_intel SET notified = TRUE
         WHERE article_id = $1 AND target_pillar = $2`,
        [article_id, target_pillar]
      );
    }
  } catch (err) {
    console.error('cross_pillar_bridges onCrossPillarNews error:', err.message);
  }
}

function init() {
  if (_initialized) return;
  eventbus.subscribe('news.cpi', onCrossPillarNews);
  _initialized = true;
  console.log('🌉 Cross-pillar news bridges activos: news.cpi → telegram (P2/P3/P4/P5)');
}

module.exports = {
  init,
  onCrossPillarNews,
  shouldAlert,
  ALWAYS_ALERT_TOPICS,
};
