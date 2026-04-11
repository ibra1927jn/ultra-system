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

// ─── B4 — gdelt.spike → telegram alert ─────────────────
// Solo high+critical disparan alerta inmediata para no spamear.
// Medium queda visible vía /cast pero sin push.
async function onGdeltSpike({ data }) {
  try {
    const { alert_id, country, alert_date, z_score, severity, current_volume,
            baseline_mean, current_tone, baseline_tone, top_url, top_title } = data;
    if (severity !== 'high' && severity !== 'critical') return;

    const sevEmoji = { critical: '🔴', high: '🟠' };
    const e = sevEmoji[severity] || '🟡';
    const z = typeof z_score === 'number' ? z_score.toFixed(2) : z_score;
    const vol = typeof current_volume === 'number' ? current_volume.toFixed(4) : current_volume;
    const base = typeof baseline_mean === 'number' ? baseline_mean.toFixed(4) : baseline_mean;
    const tone = typeof current_tone === 'number' ? current_tone.toFixed(2) : '—';
    const baseTone = typeof baseline_tone === 'number' ? baseline_tone.toFixed(2) : '—';
    const dateS = alert_date ? String(alert_date).split('T')[0] : '?';

    const lines = [
      `${e} *GDELT spike — ${country}* (${severity})`,
      ``,
      `📅 ${dateS}`,
      `📊 z-score: *${z}*  (vol ${vol} vs baseline ${base})`,
      `💬 tone: ${tone} (baseline ${baseTone})`,
    ];
    if (top_title) lines.push(``, `📰 ${String(top_title).substring(0, 200)}`);
    if (top_url) lines.push(`🔗 ${top_url}`);

    await telegram.sendAlert(lines.join('\n'));

    if (alert_id) {
      await db.query(
        `UPDATE wm_gdelt_volume_alerts SET notified = TRUE WHERE id = $1`,
        [alert_id]
      );
    }
  } catch (err) {
    console.error('cross_pillar_bridges onGdeltSpike error:', err.message);
  }
}

// ─── B5 — intel.watch.change → telegram alert ──────────
// Publicado por routes/webhooks.js cuando changedetection.io detecta
// un cambio en uno de los 33 intel_watches. Tier A (policy + hotspots)
// siempre alerta; tier B/C/D solo si el summary tiene señal explícita.
// La persistencia del change ya la hace el webhook en intel_watch_changes,
// este handler solo enruta el push al Telegram del usuario.
const TIER_EMOJI = { A: '🔴', B: '🟠', C: '🟡', D: '⚪' };

async function onIntelWatchChange({ data }) {
  try {
    const { watch_id, country, category, tier, topic, label, url, summary } = data;
    // Tier A siempre. B/C/D solo si el summary parece sustantivo
    // (>20 chars, no es solo whitespace/HTML chrome).
    const summaryStr = String(summary || '').trim();
    if (tier !== 'A' && summaryStr.length < 20) return;

    const e = TIER_EMOJI[tier] || '📡';
    const catTag = category === 'policy' ? 'policy' : `country/${country || '?'}`;
    const topicTag = topic ? ` · #${topic}` : '';

    const lines = [
      `${e} *Intel watch change* — ${catTag}${topicTag}`,
      ``,
      `*${label}*`,
    ];
    if (summaryStr) lines.push(``, summaryStr.slice(0, 400));
    if (url) lines.push(``, `🔗 ${url}`);

    await telegram.sendAlert(lines.join('\n'));

    // Mark in DB que ya alertamos este change (último por watch_id)
    if (watch_id) {
      await db.query(
        `UPDATE intel_watch_changes
         SET published_to_bus = TRUE
         WHERE watch_id = $1
           AND id = (SELECT MAX(id) FROM intel_watch_changes WHERE watch_id = $1)`,
        [watch_id]
      );
    }
  } catch (err) {
    console.error('cross_pillar_bridges onIntelWatchChange error:', err.message);
  }
}

function init() {
  if (_initialized) return;
  eventbus.subscribe('news.cpi', onCrossPillarNews);
  eventbus.subscribe('gdelt.spike', onGdeltSpike);
  eventbus.subscribe('intel.watch.change', onIntelWatchChange);
  _initialized = true;
  console.log('🌉 Cross-pillar news bridges activos: news.cpi → telegram (P2/P3/P4/P5), gdelt.spike → telegram (high/critical), intel.watch.change → telegram (B5)');
}

module.exports = {
  init,
  onCrossPillarNews,
  onGdeltSpike,
  onIntelWatchChange,
  shouldAlert,
  ALWAYS_ALERT_TOPICS,
};
