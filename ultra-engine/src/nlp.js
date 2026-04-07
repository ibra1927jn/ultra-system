// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Lightweight NLP (P1 Fase 3b)             ║
// ║                                                            ║
// ║  Pure JS, sin HF containers ni GPUs:                       ║
// ║  • TextRank summarization (Mihalcea & Tarau 2004)          ║
// ║    Extractive: ranks sentences by graph centrality.        ║
// ║  • AFINN-165 sentiment (Nielsen 2011) — embedded subset    ║
// ║    de palabras EN/ES con valencia -5 a +5.                 ║
// ║                                                            ║
// ║  Para Fase 4 (con disco): añadir BART/PEGASUS containers   ║
// ║  vía Hugging Face TGI para summarization abstractiva.      ║
// ╚══════════════════════════════════════════════════════════╝

// Subset AFINN-165 (top ~200 palabras EN + ~80 ES)
// Full lexicon: https://github.com/fnielsen/afinn
const AFINN = {
  // English negative
  abandon: -2, abandoned: -2, abuse: -3, abused: -3, abusive: -3, accident: -2, afraid: -2,
  alarm: -2, anger: -3, angry: -3, anxious: -2, apocalypse: -3, arrest: -2, arrested: -2,
  ashamed: -2, assault: -3, attack: -1, attacked: -2, awful: -3, bad: -3, badly: -3,
  bankrupt: -3, betray: -3, bias: -1, bitter: -2, blame: -2, bleak: -2, blind: -1,
  blood: -1, broke: -1, broken: -1, bullshit: -4, burden: -2, bury: -1, cancer: -1,
  catastrophic: -4, censor: -2, censored: -2, chaos: -2, cheat: -3, cheated: -3, collapse: -2,
  collapsed: -2, conflict: -2, confused: -2, corrupt: -3, crash: -2, crashed: -2, crazy: -2,
  criminal: -2, crisis: -3, critical: -2, cruel: -3, cry: -1, damage: -3, danger: -2,
  dangerous: -2, dead: -3, death: -2, deaths: -2, debt: -2, defeat: -2, defeated: -2,
  defective: -2, denied: -2, depressed: -2, despair: -3, destroy: -3, destroyed: -3,
  difficult: -1, disaster: -2, disastrous: -3, disease: -2, disrupt: -2, distress: -2,
  doom: -2, doomed: -2, doubt: -1, drama: -2, drop: -1, dropped: -1, dying: -2, embarrass: -2,
  embarrassed: -2, emergency: -2, error: -2, escape: -1, evil: -3, expensive: -2, fail: -2,
  failed: -2, failure: -2, fake: -3, false: -1, famine: -3, fatal: -3, fear: -2, fears: -2,
  feeble: -2, fight: -1, fired: -2, flaw: -2, flop: -2, fool: -2, forgotten: -1,
  fraud: -3, frighten: -2, frustrated: -2, gloom: -2, grim: -2, guilty: -3, hack: -1,
  hacked: -1, harm: -2, harmful: -2, hate: -3, hated: -3, hates: -3, hatred: -3, hell: -3,
  homicide: -3, hopeless: -3, horrible: -3, horror: -3, hostile: -2, hurt: -2, ignorant: -2,
  ill: -2, illness: -2, impossible: -2, inhibit: -1, injuries: -2, injury: -2, innocent: 1,
  insane: -2, insecurity: -2, insult: -2, intimidate: -2, intolerable: -2, jail: -2,
  jealous: -2, kill: -3, killed: -3, killing: -3, kills: -3, lame: -2, late: -1, layoff: -2,
  layoffs: -2, lazy: -1, leak: -1, leaked: -1, lie: -2, lied: -2, lonely: -2, lose: -2,
  loser: -3, losing: -2, lost: -2, lousy: -2, low: -1, mad: -3, malicious: -3, manipulate: -2,
  miserable: -3, misery: -3, mistake: -1, murder: -3, naive: -2, nasty: -3, need: -1,
  negative: -2, nightmare: -2, no: -1, nobody: -1, nope: -2, nothing: -1, notorious: -2,
  outbreak: -2, overwhelm: -2, pain: -2, painful: -2, panic: -3, paralyzed: -2, paranoid: -2,
  pessimistic: -2, plot: -1, poison: -2, poor: -2, poverty: -1, problem: -2, problems: -2,
  protest: -2, punish: -2, quit: -1, quitter: -2, racist: -3, rage: -2, rape: -4, rebel: -2,
  recession: -2, refuse: -2, refused: -2, regret: -2, reject: -1, rejected: -2, riot: -2,
  risk: -2, risky: -2, rude: -2, ruin: -2, rumor: -2, sad: -2, sadly: -2, sanction: -2,
  sanctioned: -2, scam: -3, scams: -3, scared: -2, scary: -2, sceptical: -2, screwed: -2,
  selfish: -2, severe: -2, shame: -2, shock: -1, shocked: -2, sick: -2, skeptical: -2,
  slow: -1, smear: -2, sob: -1, sorry: -1, stabbed: -3, steal: -2, stolen: -2, strike: -1,
  struggle: -2, stupid: -3, sucks: -3, suffer: -2, suicide: -3, suspect: -1, suspicious: -2,
  terrible: -3, terror: -3, terrorist: -3, threat: -2, threaten: -2, tired: -2, tragedy: -3,
  tragic: -3, trapped: -2, traumatic: -3, trouble: -2, ugly: -3, unable: -2, unfair: -2,
  unhappy: -2, unjust: -2, unsafe: -2, upset: -2, useless: -2, victim: -2, violation: -2,
  violence: -3, violent: -3, virus: -2, war: -3, warn: -2, warning: -2, weak: -2, weep: -2,
  worried: -3, worry: -3, worse: -3, worst: -3, wrong: -2,
  // English positive
  abundance: 2, accept: 1, accepted: 1, accomplished: 2, achieve: 2, achieved: 2, active: 1,
  admire: 3, adopt: 1, adore: 3, advance: 1, advantage: 2, advocate: 2, affirm: 2, afford: 2,
  agree: 1, alive: 1, amazing: 4, amazed: 3, applause: 2, appreciate: 2, appreciated: 2,
  approve: 2, ascending: 1, aspire: 2, assure: 2, attractive: 2, awesome: 4, beautiful: 3,
  belief: 1, believe: 1, beloved: 3, benefit: 2, best: 3, better: 2, big: 1, bless: 2,
  blessed: 3, bliss: 3, blissful: 3, bonus: 2, boost: 1, brave: 2, breakthrough: 3, bright: 1,
  brilliant: 4, build: 1, calm: 2, capable: 2, care: 2, cares: 2, caring: 2, celebrate: 3,
  celebrated: 3, certain: 1, champion: 2, charm: 2, charming: 3, cheer: 2, cheered: 2,
  cherish: 3, clean: 2, clear: 1, comfort: 2, comfortable: 2, commit: 1, committed: 2,
  compassion: 3, complete: 1, completed: 1, confident: 2, congratulate: 2, content: 2,
  cool: 1, courage: 2, courageous: 2, create: 1, created: 1, creative: 2, credit: 2,
  cute: 2, dazzle: 3, dear: 2, defend: 1, delight: 3, delighted: 3, dependable: 2, deserve: 2,
  determined: 2, devoted: 3, divine: 3, dream: 1, eager: 2, easy: 1, ecstatic: 4,
  effective: 2, efficient: 2, elated: 3, elegant: 2, embrace: 2, empower: 2, encourage: 2,
  energetic: 2, enjoy: 2, enjoyed: 2, enthusiastic: 3, equal: 2, escape: 1, ethical: 2,
  excellence: 3, excellent: 3, excite: 3, excited: 3, exciting: 3, exhilarated: 4, expert: 2,
  fabulous: 4, fair: 1, faith: 2, faithful: 3, fame: 1, famed: 2, fantastic: 4, fast: 1,
  favor: 2, favorable: 2, festive: 2, fine: 2, flatter: 2, flourish: 3, fond: 2, forgive: 2,
  fortunate: 2, fortune: 2, free: 1, freedom: 2, fresh: 1, friend: 1, friendly: 2, fun: 2,
  funny: 2, gain: 2, generous: 2, gentle: 2, genuine: 2, gift: 2, glad: 3, glory: 2,
  good: 3, goodness: 3, gorgeous: 3, grace: 2, graceful: 2, grateful: 3, great: 3, growing: 1,
  growth: 2, hail: 2, happiness: 3, happy: 3, harmony: 2, healthy: 2, heart: 1, heaven: 2,
  helpful: 2, hero: 2, heroic: 3, hilarious: 3, holy: 2, honest: 2, honor: 2, hooray: 4,
  hope: 2, hopeful: 2, hugs: 2, ideal: 2, impress: 3, impressed: 3, improvement: 2,
  incredible: 4, independent: 2, innovate: 2, innovation: 2, inspire: 3, intelligent: 2,
  interest: 1, interesting: 2, joke: 2, joy: 3, joyful: 3, joyous: 3, jubilant: 4, kind: 2,
  laugh: 1, learn: 1, liberate: 2, liberty: 3, life: 1, like: 2, liked: 2, lively: 2,
  love: 3, loved: 3, lovely: 3, lover: 2, loyal: 3, lucky: 3, magic: 1, magnificent: 4,
  marvelous: 4, master: 2, matter: 1, mercy: 2, merry: 3, mighty: 2, miracle: 4, motivated: 2,
  natural: 1, neat: 2, nice: 3, nobel: 4, novel: 2, oasis: 2, optimistic: 2, outstanding: 4,
  paradise: 3, passionate: 2, peace: 2, peaceful: 2, perfect: 3, perfection: 3, please: 1,
  pleased: 2, pleasure: 3, plenty: 2, popular: 2, positive: 2, powerful: 2, praise: 3,
  prefer: 1, premium: 2, prepared: 1, pretty: 1, pride: 2, prize: 1, profound: 2, promote: 1,
  promised: 1, propose: 1, proud: 2, prove: 2, quality: 2, quick: 1, ready: 1, recommend: 2,
  redeemed: 2, refresh: 1, refreshed: 1, refreshing: 2, refuge: 2, refund: 2, rejoice: 4,
  rejoicing: 4, relax: 2, relaxed: 2, relief: 2, relieve: 1, relieved: 2, remarkable: 4,
  rescue: 2, resolve: 2, resolved: 2, respect: 2, respected: 2, restored: 2, restful: 2,
  reward: 2, rich: 2, richer: 2, ridiculous: -3, righteous: 2, robust: 2, rosy: 2,
  safe: 1, sane: 2, satisfaction: 3, satisfied: 3, save: 2, saved: 2, sensational: 5,
  serene: 2, share: 1, shared: 1, sharing: 2, shine: 2, smart: 1, smile: 2, smooth: 1,
  soothing: 1, sparkling: 1, spectacular: 4, splendid: 3, stable: 2, star: 2, strong: 2,
  stronger: 2, strongest: 2, stunning: 4, succeed: 2, success: 2, successful: 3, sufficient: 2,
  superb: 5, support: 2, supported: 2, supporter: 1, supportive: 2, sure: 1, surprised: 2,
  surprising: 2, sweet: 2, talent: 2, talented: 2, terrific: 4, thank: 2, thankful: 2,
  thanks: 2, thrilled: 5, top: 2, tough: 1, treasure: 2, true: 2, trust: 1, trusted: 2,
  truth: 1, unbeatable: 5, united: 1, useful: 2, valid: 1, valuable: 2, value: 2,
  victorious: 4, victory: 4, vital: 1, vivid: 1, vivacious: 4, warm: 1, warmth: 2,
  welcome: 2, wealthy: 3, well: 1, win: 4, winner: 4, winning: 4, wins: 4, wisdom: 2,
  wise: 2, wonderful: 4, wonderfully: 4, wow: 4, yay: 5, yes: 1,
  // Spanish básico
  amor: 3, amistad: 3, amigo: 2, amable: 2, alegre: 3, alegria: 3, asombroso: 4,
  ataque: -2, ayuda: 2, bello: 3, bien: 2, bonito: 3, bueno: 3, brillante: 4,
  catástrofe: -4, celebrar: 3, contento: 3, crisis: -3, cruel: -3, dañar: -2, daño: -2,
  decepción: -2, derrota: -2, deseo: 1, desastre: -3, destruir: -3, dolor: -2,
  enemigo: -2, enfermo: -2, encantador: 3, esperanza: 2, espléndido: 3, éxito: 3,
  familia: 1, famoso: 2, favorito: 2, feliz: 3, felicidad: 3, fracaso: -2, fuerte: 2,
  generoso: 2, genial: 4, gratitud: 3, guapo: 2, guerra: -3, hambre: -2, herido: -2,
  hermoso: 4, honor: 2, ideal: 2, ilusión: 2, imposible: -2, increíble: 4, injusto: -2,
  inteligente: 2, justo: 2, ladrón: -2, libertad: 3, lindo: 2, llorar: -2, logro: 3,
  lucha: -1, mal: -3, maravilla: 3, maravilloso: 4, miedo: -2, miseria: -3, muerte: -3,
  muerto: -3, nacer: 2, odio: -3, optimismo: 2, paz: 3, perdón: 2, pésimo: -3, pobreza: -2,
  precioso: 3, problema: -2, querer: 1, querido: 3, riesgo: -2, robar: -2, robo: -2,
  saludable: 2, satisfacción: 3, sentimiento: 1, sonreír: 2, sufrir: -3, súper: 3,
  terrible: -3, tragedia: -3, triste: -2, triunfo: 3, victoria: 4, virus: -2, vivir: 2,
};

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .replace(/[^\wáéíóúñü\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function splitSentences(text) {
  if (!text) return [];
  // Split on . ! ? seguido de espacio + mayúscula, o final de string
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])/)
    .map(s => s.trim())
    .filter(s => s.length > 20);
}

/**
 * AFINN sentiment analysis. Returns { score, comparative, hits }
 * - score: sum de valencias
 * - comparative: score / total tokens (-5 to +5 normalized)
 */
function sentiment(text) {
  const tokens = tokenize(text);
  let score = 0;
  const hits = [];
  for (const t of tokens) {
    if (AFINN[t] !== undefined) {
      score += AFINN[t];
      hits.push({ word: t, score: AFINN[t] });
    }
  }
  return {
    score,
    comparative: tokens.length > 0 ? Number((score / tokens.length).toFixed(4)) : 0,
    word_count: tokens.length,
    hits: hits.slice(0, 10),
    label: score > 1 ? 'positive' : score < -1 ? 'negative' : 'neutral',
  };
}

/**
 * TextRank extractive summarization (Mihalcea & Tarau 2004 simplificado).
 * - Split en sentences
 * - Compute Jaccard similarity entre cada par
 * - PageRank-style iteration
 * - Return top N sentences
 */
function summarize(text, { numSentences = 3, dampening = 0.85, maxIter = 30, tol = 1e-4 } = {}) {
  const sentences = splitSentences(text);
  if (sentences.length <= numSentences) return sentences.join(' ');

  // Build sentence-token sets
  const tokenSets = sentences.map(s => new Set(tokenize(s).filter(t => t.length > 2)));

  // Build similarity matrix (Jaccard)
  const n = sentences.length;
  const sim = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = tokenSets[i], b = tokenSets[j];
      if (a.size === 0 || b.size === 0) continue;
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      const union = a.size + b.size - inter;
      const s = union > 0 ? inter / union : 0;
      sim[i][j] = s;
      sim[j][i] = s;
    }
  }

  // PageRank
  let scores = new Array(n).fill(1 / n);
  for (let iter = 0; iter < maxIter; iter++) {
    const newScores = new Array(n).fill((1 - dampening) / n);
    for (let i = 0; i < n; i++) {
      let rowSum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        let outSum = 0;
        for (let k = 0; k < n; k++) if (k !== j) outSum += sim[j][k];
        if (outSum > 0) rowSum += (sim[j][i] / outSum) * scores[j];
      }
      newScores[i] += dampening * rowSum;
    }
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(newScores[i] - scores[i]);
    scores = newScores;
    if (diff < tol) break;
  }

  // Pick top N preserving original order
  const ranked = sentences.map((s, i) => ({ s, i, score: scores[i] }));
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, numSentences).sort((a, b) => a.i - b.i);
  return top.map(t => t.s).join(' ');
}

// ════════════════════════════════════════════════════════════
//  P1 Fase 3c — NER (compromise.js + regex hybrid)
//  R3: replaced regex-only extractPeople with compromise NLP
//  for higher recall + adds organizations + places extraction.
//  compromise is ~1MB, pure JS, no model download.
// ════════════════════════════════════════════════════════════
let _compromise = null;
function getCompromise() {
  if (_compromise === null) {
    try { _compromise = require('compromise'); }
    catch { _compromise = false; } // package missing → fallback to regex
  }
  return _compromise || null;
}


// ISO2 country codes (subset relevante para usuario)
const COUNTRY_NAMES_TO_ISO = {
  'new zealand': 'NZ', 'nz': 'NZ', 'aotearoa': 'NZ',
  'australia': 'AU', 'aussie': 'AU',
  'spain': 'ES', 'españa': 'ES', 'spanish': 'ES',
  'algeria': 'DZ', 'argelia': 'DZ', 'algerie': 'DZ',
  'france': 'FR', 'francia': 'FR', 'french': 'FR',
  'germany': 'DE', 'deutschland': 'DE', 'alemania': 'DE',
  'united kingdom': 'GB', 'britain': 'GB', 'england': 'GB', 'uk': 'GB',
  'united states': 'US', 'america': 'US', 'usa': 'US',
  'canada': 'CA', 'canadá': 'CA',
  'morocco': 'MA', 'marruecos': 'MA', 'maroc': 'MA',
  'tunisia': 'TN', 'tunisie': 'TN',
  'italy': 'IT', 'italia': 'IT',
  'portugal': 'PT', 'lisbon': 'PT',
  'japan': 'JP', 'japón': 'JP',
  'china': 'CN', 'china': 'CN',
  'india': 'IN',
  'brazil': 'BR', 'brasil': 'BR',
  'mexico': 'MX', 'méxico': 'MX',
  'russia': 'RU', 'rusia': 'RU',
  'ukraine': 'UA', 'ucrania': 'UA',
  'israel': 'IL',
  'palestine': 'PS', 'palestina': 'PS',
  'iran': 'IR', 'irán': 'IR',
  'saudi arabia': 'SA', 'arabia saudita': 'SA',
  'turkey': 'TR', 'turquía': 'TR',
};

// Currency symbols + codes
const CURRENCY_PATTERNS = {
  USD: /\$|\bUSD\b|\bUS\$\b|\bdollars?\b/,
  EUR: /€|\bEUR\b|\beuros?\b/,
  GBP: /£|\bGBP\b|\bpounds?\b/,
  NZD: /\bNZD\b|\bNZ\$\b/,
  AUD: /\bAUD\b|\bAU\$\b/,
  JPY: /¥|\bJPY\b|\byen\b/,
  CHF: /\bCHF\b|\bswiss francs?\b/,
  CAD: /\bCAD\b|\bCanadian dollars?\b/,
};

/**
 * Extrae países mencionados (devuelve ISO2 únicos).
 */
function extractCountries(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Set();
  for (const [name, iso] of Object.entries(COUNTRY_NAMES_TO_ISO)) {
    // Match word-boundary
    const re = new RegExp(`\\b${name.replace(/\+/g, '\\+')}\\b`, 'i');
    if (re.test(lower)) found.add(iso);
  }
  return [...found];
}

/**
 * Extrae menciones de currency (devuelve códigos ISO únicos).
 */
function extractCurrencies(text) {
  if (!text) return [];
  const found = new Set();
  for (const [code, re] of Object.entries(CURRENCY_PATTERNS)) {
    if (re.test(text)) found.add(code);
  }
  return [...found];
}

/**
 * Extrae cantidades monetarias con currency. Match formats:
 *  - $1,234.56  €500  £1.5M  USD 10000  10K USD
 */
function extractMoneyAmounts(text) {
  if (!text) return [];
  const found = [];
  const seen = new Set();
  // Symbol prefix: $1,234 or €500 or £1.5M
  const re1 = /([\$€£¥])\s*([\d,]+(?:\.\d+)?)\s*(K|M|B|k|m|b)?/g;
  const symMap = { '$': 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
  const multMap = { K: 1e3, M: 1e6, B: 1e9 };
  let m;
  while ((m = re1.exec(text)) !== null) {
    const sym = m[1];
    let amount = parseFloat(m[2].replace(/,/g, ''));
    if (m[3]) amount *= multMap[m[3].toUpperCase()] || 1;
    const key = `${symMap[sym]}:${amount}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ amount, currency: symMap[sym], raw: m[0] });
    }
  }
  // Code suffix: 10000 USD or 10K USD
  const re2 = /([\d,]+(?:\.\d+)?)\s*(K|M|B|k|m|b)?\s*(USD|EUR|GBP|NZD|AUD|JPY|CHF|CAD)\b/g;
  while ((m = re2.exec(text)) !== null) {
    let amount = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]) amount *= multMap[m[2].toUpperCase()] || 1;
    const code = m[3];
    const key = `${code}:${amount}`;
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ amount, currency: code, raw: m[0] });
    }
  }
  return found;
}

/**
 * Detecta nombres de personas. Usa compromise.js si está disponible
 * (NER real con tagging POS), sino fallback al regex previo.
 */
function extractPeople(text) {
  if (!text) return [];
  const c = getCompromise();
  if (c) {
    try {
      const doc = c(text);
      const arr = doc.people().out('array');
      return [...new Set(arr.map(s => s.replace(/[.,;:]+$/, '').trim()).filter(s => s.length > 1 && s.length < 50))].slice(0, 15);
    } catch { /* fall through */ }
  }
  // Fallback regex (pre-R3)
  const found = new Set();
  const re = /(?:(?:Mr|Mrs|Ms|Dr|Prof|Sr|Sra|Dn|Don|Doña)\.?\s+)?([A-ZÁÉÍÓÚ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóúñ]+){1,2})/g;
  const stopWords = new Set(['New', 'York', 'United', 'States', 'European', 'Union', 'January', 'February',
    'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Spain', 'France',
    'Germany', 'Italy', 'Reuters', 'BBC', 'World', 'Bank', 'Central', 'Federal']);
  let m;
  while ((m = re.exec(text)) !== null) {
    const candidate = m[1];
    if (stopWords.has(candidate.split(' ')[0])) continue;
    if (candidate.length > 50) continue;
    found.add(candidate);
  }
  return [...found].slice(0, 10);
}

/**
 * Detecta organizaciones (compromise.js NER). Returns [] sin compromise.
 */
function extractOrganizations(text) {
  if (!text) return [];
  const c = getCompromise();
  if (!c) return [];
  try {
    const arr = c(text).organizations().out('array');
    return [...new Set(arr.map(s => s.replace(/[.,;:]+$/, '').trim()).filter(s => s.length > 1 && s.length < 60))].slice(0, 15);
  } catch { return []; }
}

/**
 * Detecta lugares (ciudades/regiones, no países — esos en extractCountries).
 */
function extractPlaces(text) {
  if (!text) return [];
  const c = getCompromise();
  if (!c) return [];
  try {
    const arr = c(text).places().out('array');
    return [...new Set(arr.map(s => s.replace(/[.,;:]+$/, '').trim()).filter(s => s.length > 1 && s.length < 60))].slice(0, 15);
  } catch { return []; }
}

/**
 * Extract all entities at once.
 */
function extractEntities(text) {
  return {
    countries: extractCountries(text),
    currencies: extractCurrencies(text),
    money: extractMoneyAmounts(text),
    people: extractPeople(text),
    organizations: extractOrganizations(text),
    places: extractPlaces(text),
    _source: 'compromise',
  };
}

// ════════════════════════════════════════════════════════════
//  spaCy NER sidecar (opt-in, async)
//  Usar para contenido importante: high-score articles,
//  opportunities, OCR'd documents. Más exacto que compromise
//  pero llamada HTTP (~20-100ms). Fallback automático si el
//  sidecar no responde.
// ════════════════════════════════════════════════════════════
const uniq = (arr, max) => [...new Set(arr.filter(s => s && s.length > 1 && s.length < 80))].slice(0, max);

async function extractEntitiesSpacy(text, lang = 'en') {
  if (!text) return extractEntities('');
  const spacy = require('./spacy');
  const result = await spacy.ner(text, lang);
  if (!result || !Array.isArray(result.entities)) {
    // sidecar down → fallback síncrono a compromise
    return extractEntities(text);
  }
  const ents = result.entities;
  const byLabel = (lbl) => ents.filter(e => e.label === lbl).map(e => e.text.trim());
  // spaCy labels: PERSON, ORG, GPE (countries/cities), LOC, MONEY, NORP, FAC, PRODUCT, EVENT, ...
  // ES (es_core_news_sm): PER, ORG, LOC, MISC
  const people = [...byLabel('PERSON'), ...byLabel('PER')];
  const orgs = byLabel('ORG');
  const places = [...byLabel('GPE'), ...byLabel('LOC')];
  return {
    // Países/currencies/money se mantienen con regex (más estables que NER)
    countries: extractCountries(text),
    currencies: extractCurrencies(text),
    money: extractMoneyAmounts(text),
    people: uniq(people, 15),
    organizations: uniq(orgs, 15),
    places: uniq(places, 15),
    _source: 'spacy',
    _lang: lang,
    _raw_count: ents.length,
  };
}

module.exports = {
  sentiment, summarize, splitSentences, tokenize, AFINN,
  extractCountries, extractCurrencies, extractMoneyAmounts,
  extractPeople, extractOrganizations, extractPlaces, extractEntities,
  extractEntitiesSpacy,
};
