// Money Cockpit — pure utility functions.
// Shared between browser (window.MoneyUtils) and Node tests. No DOM access.

/** HTML-escape a string. Prevents XSS when inserting user-controlled text into innerHTML. */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Locale-aware money/number formatter. Returns "—" for null/NaN. opts.dp = decimals (default 0), opts.sign = force "+" prefix on positives. */
function fmt(n, opts) {
  opts = opts || {};
  if (n == null || isNaN(n)) return '—';
  const v = Number(n);
  const dp = opts.dp == null ? 0 : opts.dp;
  return (opts.sign && v >= 0 ? '+' : '') +
    v.toLocaleString('en-NZ', { maximumFractionDigits: dp, minimumFractionDigits: dp });
}

/** Percentage formatter with explicit "+"/"-" prefix. Returns "—" on invalid. */
function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';
}

/** Slice ISO date "2026-04-14T...." → "2026-04-14". Returns "—" if falsy. */
function dateOnly(d) { return d ? String(d).slice(0, 10) : '—'; }

/** Current month in "YYYY-MM" form (browser TZ). */
function thisMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Classify a budget % usage into 'ok' | 'warn' | 'danger' for color coding. */
function budgetSeverity(pct, warnPct, dangerPct) {
  if (pct >= (dangerPct || 100)) return 'danger';
  if (pct >= (warnPct || 80)) return 'warn';
  return 'ok';
}

/** Days-until human label (overdue / today / Nd). Pass null for "—". */
function daysUntilLabel(days) {
  if (days == null) return '—';
  if (days < 0) return Math.abs(days) + 'd overdue';
  if (days === 0) return 'today';
  return days + 'd';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { esc, fmt, fmtPct, dateOnly, thisMonth, budgetSeverity, daysUntilLabel };
} else if (typeof window !== 'undefined') {
  window.MoneyUtils = { esc, fmt, fmtPct, dateOnly, thisMonth, budgetSeverity, daysUntilLabel };
}
