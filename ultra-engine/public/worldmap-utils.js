// ╔══════════════════════════════════════════════════════════╗
// ║  WorldMap — pure utility functions                       ║
// ║  Shared between browser (window globals) and Node tests. ║
// ║  No DOM / no globals accessed; all inputs are arguments. ║
// ╚══════════════════════════════════════════════════════════╝

/** HTML-escape a string. Prevents XSS when inserting user-controlled text into innerHTML. */
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Convert ISO2 country code to flag emoji. Returns '' for invalid input. */
const _FLAG_CACHE = {};
function isoToFlag(iso) {
  if (_FLAG_CACHE[iso]) return _FLAG_CACHE[iso];
  if (!iso || typeof iso !== 'string' || iso.length !== 2) return '';
  const cp = [...iso.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65);
  return _FLAG_CACHE[iso] = String.fromCodePoint(...cp);
}

/** Relative time string: "just now", "5m ago", "3h ago", "2d ago". Empty for invalid/future. */
function getTimeAgo(d, now) {
  if (!d) return '';
  const t = new Date(d).getTime();
  if (isNaN(t)) return '';
  const s = Math.round(((now || Date.now()) - t) / 1000);
  if (s < 0) return 'just now';         // future → treat as now
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Format a numeric price with dynamic decimals (4 for <1, 2 for 1-100, 0 for 10k+). */
function fmtPrice(v) {
  const n = parseFloat(v);
  if (!isFinite(n)) return '0';
  if (n >= 10000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return n.toFixed(2);
  return n.toFixed(4);
}

/** Format a volume/market cap: $1.5B, $230M, $45K, $123. */
function fmtVol(v) {
  const n = parseFloat(v);
  if (!isFinite(n) || n <= 0) return '$0';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

/** Simple fuzzy-match score used by command palette. 0 = no match, higher = better. */
function fuzzyMatch(q, s) {
  if (!q) return 1;
  q = String(q).toLowerCase();
  s = String(s).toLowerCase();
  if (s.includes(q)) return 100 - s.indexOf(q);
  let qi = 0, score = 0;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) { score++; qi++; }
  }
  return qi === q.length ? score / q.length : 0;
}

/** Sort articles by given mode: 'date' (newest first), 'relevance', 'sentiment' (neg→pos). */
function sortArticles(articles, mode) {
  const sorted = [...articles];
  if (mode === 'relevance') {
    sorted.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
  } else if (mode === 'sentiment') {
    const o = { negative: 0, neutral: 1, positive: 2 };
    sorted.sort((a, b) => (o[a.sentiment_label] || 1) - (o[b.sentiment_label] || 1));
  } else {
    sorted.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  }
  return sorted;
}

// ── Export for both browser (globals) and Node (module) ──
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escHtml, isoToFlag, getTimeAgo, fmtPrice, fmtVol, fuzzyMatch, sortArticles };
} else if (typeof window !== 'undefined') {
  // Browser: expose to window for reference (optional; main worldmap.js still
  // declares its own copies that shadow these. Over time we should migrate.)
  window.WMUtils = { escHtml, isoToFlag, getTimeAgo, fmtPrice, fmtVol, fuzzyMatch, sortArticles };
}
