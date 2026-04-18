// ─── /api/home ─────────────────────────────────────────────
// Agregador de la portada SPA. Compone funciones puras de src/domain/.
// Fase 1.2: TTL=0 en todas las secciones (ver src/domain/home-cache.js).
// Promise.allSettled -> fallo por sección, nunca global. 503 sólo si DB cae.

const express = require('express');
const router = express.Router();
const db = require('../db');

const bio = require('../domain/bio');
const opps = require('../domain/opportunities');
const fin = require('../domain/finances');
const log = require('../domain/logistics');
const bur = require('../domain/bureaucracy');
const wmnews = require('../domain/wm-news');
const homeCache = require('../domain/home-cache');
const { snapshotCache } = require('./wm/cache');

// fase 1.2: TTL=0 en todas las claves de homeCache.getOrCompute (ver llamadas safe()).
// Cuando midamos coste real, subimos TTLs por sección sin tocar el contrato.

const BADGE_PRIORITY = { none: 0, info: 25, warn: 50, alert: 75 };
const SEV_RANK = { high: 3, med: 2, low: 1 };

function makeSection({ kpi = null, label = null, badge = 'none', preview = null }) {
  return {
    status: 'ok', kpi, label, badge, preview,
    priorityScore: BADGE_PRIORITY[badge] ?? 0, error: null,
  };
}
function emptySection() {
  return { status: 'empty', kpi: null, label: null, badge: 'none', preview: null, priorityScore: 0, error: null };
}
function errorSection(err) {
  return { status: 'error', kpi: null, label: null, badge: 'none', preview: null, priorityScore: 0, error: String(err && err.message || err) };
}

// ─── World builder (único standalone porque depende de cache opportunista) ────
async function buildWorld() {
  const pulse = await wmnews.getNewsPulse();
  const spikes = pulse.topic_spikes || [];
  const continents = pulse.top_by_continent || [];
  // Markets snapshot oportunista: lee del cache TTL existente, no recomputa.
  const cachedSnap = snapshotCache.get('/api/wm/markets/snapshot');
  const marketKpi = cachedSnap?.data?.kpis || null;
  if (!continents.length && !spikes.length) return emptySection();
  const badge = spikes.length >= 3 ? 'alert' : (spikes.length ? 'warn' : 'info');
  const preview = [
    ...spikes.slice(0, 3).map((s, i) => ({
      id: `spike-${i}-${s.topic}`,
      text: `${s.topic} ×${Number(s.velocity).toFixed(1)}`,
      meta: `${s.article_count} artículos`,
    })),
    ...continents.slice(0, 5 - Math.min(3, spikes.length)).map((c, i) => ({
      id: `cont-${i}-${c.continent}`,
      text: c.title,
      meta: `${c.continent} · ${c.source_name}`,
    })),
  ].slice(0, 5);
  const kpi = spikes.length || (pulse.volume?.h6 ?? 0);
  const label = spikes.length
    ? `${spikes.length} topic spikes`
    : (marketKpi?.vix ? `VIX ${marketKpi.vix.value}` : `${pulse.volume?.h6 ?? 0} arts/6h`);
  return makeSection({ kpi, label, badge, preview: preview.length ? preview : null });
}

// ─── mustDo: top 5 acciones cross-cutting ────────────────────

function buildMustDo({ moneyRaw, movesRaw, meRaw }) {
  const items = [];
  // logistics next48h
  if (movesRaw && movesRaw.next48 && Array.isArray(movesRaw.next48.data)) {
    for (const i of movesRaw.next48.data) {
      const sev = i.urgency === 'critical' ? 'high' : (i.urgency === 'urgent' ? 'med' : 'low');
      items.push({
        id: `log-${i.id}`,
        source: 'logistics',
        title: i.title || i.type || 'evento',
        dueAt: i.date ? new Date(i.date).toISOString() : null,
        severity: sev,
        href: '/app/moves/upcoming',
      });
    }
  }
  // tax deadlines ≤14d
  if (movesRaw && Array.isArray(movesRaw.taxes)) {
    for (const t of movesRaw.taxes) {
      const d = parseInt(t.days_remaining, 10);
      const sev = d <= 3 ? 'high' : (d <= 7 ? 'med' : 'low');
      items.push({
        id: `tax-${t.id}`,
        source: 'bureaucracy',
        title: `${t.name} (${t.country})`,
        dueAt: t.deadline ? new Date(t.deadline).toISOString() : null,
        severity: sev,
        href: '/app/me/timeline',
      });
    }
  }
  // bio alerts critical/warning
  if (meRaw && Array.isArray(meRaw.alerts)) {
    for (let i = 0; i < meRaw.alerts.length; i++) {
      const a = meRaw.alerts[i];
      const sev = a.severity === 'critical' ? 'high' : (a.severity === 'warning' ? 'med' : 'low');
      items.push({
        id: `bio-${a.type}-${i}`,
        source: 'bio',
        title: a.message,
        dueAt: null,
        severity: sev,
        href: '/app/me/bio',
      });
    }
  }
  // budget overspend
  if (moneyRaw && Array.isArray(moneyRaw.alerts)) {
    for (const b of moneyRaw.alerts) {
      const pct = parseFloat(b.percent_used);
      if (pct < 80) continue;
      const sev = pct >= 100 ? 'high' : 'med';
      items.push({
        id: `bud-${b.category}`,
        source: 'money',
        title: `Presupuesto ${b.category} al ${b.percent_used}%`,
        dueAt: null,
        severity: sev,
        href: '/app/money',
      });
    }
  }
  items.sort((a, b) => {
    const r = (SEV_RANK[b.severity] || 0) - (SEV_RANK[a.severity] || 0);
    if (r) return r;
    if (a.dueAt && b.dueAt) return a.dueAt.localeCompare(b.dueAt);
    if (a.dueAt) return -1;
    if (b.dueAt) return 1;
    return 0;
  });
  return items.slice(0, 5);
}

// ─── Handler principal ──────────────────────────────────────

router.get('/overview', async (_req, res) => {
  // Pre-check DB: si la conexión está caída, 503 inmediato (no tiene sentido lanzar 8 queries).
  try {
    await db.queryOne('SELECT 1 AS ok');
  } catch (err) {
    return res.status(503).json({ ok: false, error: 'database unavailable' });
  }

  const safe = (key, ttlMs, fn) => homeCache.getOrCompute(key, ttlMs, fn).then(
    v => ({ ok: true, value: v }),
    err => { console.error(`home/${key} failed:`, err.message); return { ok: false, error: err }; }
  );

  // Datos crudos en paralelo. TTLs calibrados 2026-04-18: 30-60s por clave.
  // Home es la primera vista; un hit rate alto reduce latencia percibida sin
  // sacrificar frescura relevante. POST desde SPA (mood/finances/logistics)
  // podría invalidar claves específicas — queda como deuda técnica (llamar
  // homeCache.clear() desde los endpoints de escritura).
  const [meAlertsRes, moodRes, oppsRes, monthSummary, budgetAlerts, next48Res, taxesRes] = await Promise.all([
    safe('me.alerts', 60_000, () => bio.getOpenHealthAlerts()),
    safe('me.mood',   30_000, () => bio.getRecentMood({ days: 7 })),
    safe('work',      60_000, () => opps.getHighScoreOpps({ minScore: 8, limit: 5 })),
    safe('money.sum', 30_000, () => fin.getMonthSummary()),
    safe('money.bud', 60_000, () => fin.getBudgetAlerts()),
    safe('moves.48',  60_000, () => log.getNext48h()),
    safe('moves.tax', 60_000, () => bur.listTaxDeadlines({ daysAhead: 14 })),
  ]);

  // Schengen es opcional (no rompe moves)
  let schengenStatus = null;
  try { schengenStatus = await bur.getSchengenStatus(); } catch (e) { /* silencioso */ }

  // World en una sola coroutine — news/pulse ya cambia poco entre calls.
  const worldRes = await safe('world', 60_000, () => buildWorld());

  // Construir secciones a partir de los crudos (reutilizando los builders)
  const me = (meAlertsRes.ok && moodRes.ok)
    ? await buildSectionFromRaw('me', { alerts: meAlertsRes.value, mood: moodRes.value })
    : errorSection((meAlertsRes.error || moodRes.error));

  const work = oppsRes.ok
    ? await buildSectionFromRaw('work', oppsRes.value)
    : errorSection(oppsRes.error);

  const money = (monthSummary.ok && budgetAlerts.ok)
    ? await buildSectionFromRaw('money', { summary: monthSummary.value, alerts: budgetAlerts.value })
    : errorSection((monthSummary.error || budgetAlerts.error));

  const moves = (next48Res.ok && taxesRes.ok)
    ? await buildSectionFromRaw('moves', { next48: next48Res.value, taxes: taxesRes.value, schengen: schengenStatus })
    : errorSection((next48Res.error || taxesRes.error));

  const world = worldRes.ok ? worldRes.value : errorSection(worldRes.error);

  const mustDo = buildMustDo({
    moneyRaw: budgetAlerts.ok ? { alerts: budgetAlerts.value.data } : null,
    movesRaw: (next48Res.ok && taxesRes.ok) ? { next48: next48Res.value, taxes: taxesRes.value } : null,
    meRaw: meAlertsRes.ok ? meAlertsRes.value : null,
  });

  const partial = [meAlertsRes, moodRes, oppsRes, monthSummary, budgetAlerts, next48Res, taxesRes, worldRes]
    .some(r => !r.ok);

  res.json({
    generatedAt: new Date().toISOString(),
    mustDo,
    partial,
    me, work, money, moves, world,
  });
});

// ─── Helpers para derivar Section a partir de raw ya cargado ───
async function buildSectionFromRaw(name, raw) {
  switch (name) {
    case 'me': {
      const alerts = raw.alerts.alerts || [];
      const mood = raw.mood.data || [];
      if (!alerts.length && !mood.length) return emptySection();
      const hasCritical = alerts.some(a => a.severity === 'critical');
      const badge = hasCritical ? 'alert' : (alerts.length ? 'warn' : 'info');
      const preview = [
        ...alerts.slice(0, 3).map((a, i) => ({ id: `alert-${i}`, text: a.message, meta: a.severity })),
        ...mood.slice(0, Math.max(0, 5 - alerts.length)).map(m => ({
          id: `mood-${m.id}`,
          text: `Mood ${m.mood}/10 · energía ${m.energy ?? '—'}`,
          meta: m.logged_at ? new Date(m.logged_at).toISOString().slice(0, 10) : null,
        })),
      ].slice(0, 5);
      return makeSection({
        kpi: alerts.length,
        label: alerts.length ? `${alerts.length} alertas de salud` : 'sin alertas',
        badge,
        preview: preview.length ? preview : null,
      });
    }
    case 'work': {
      const { count, data } = raw;
      if (!count) return emptySection();
      return makeSection({
        kpi: count,
        label: `${count} oportunidades ≥8`,
        badge: 'info',
        preview: data.map(o => ({
          id: `opp-${o.id}`,
          text: o.title,
          meta: o.source ? `${o.source} · ${o.match_score}` : `score ${o.match_score}`,
        })),
      });
    }
    case 'money': {
      const { summary, alerts } = raw;
      const balance = summary.balance ?? 0;
      const overspend = (alerts.data || []).filter(a => parseFloat(a.percent_used) >= 100).length;
      if (!summary.income && !summary.expense && !alerts.count) return emptySection();
      const badge = overspend ? 'alert' : (alerts.count ? 'warn' : (balance < 0 ? 'warn' : 'info'));
      const previewCats = (summary.byCategory || [])
        .filter(c => c.type === 'expense').slice(0, 3)
        .map(c => ({ id: `cat-${c.category}`, text: c.category, meta: `${parseFloat(c.total).toFixed(0)}` }));
      const previewAlerts = (alerts.data || []).slice(0, 2)
        .map(a => ({ id: `bud-${a.category}`, text: `${a.category} ${a.percent_used}%`, meta: 'presupuesto' }));
      const preview = [...previewAlerts, ...previewCats].slice(0, 5);
      return makeSection({
        kpi: Math.round(balance),
        label: `balance ${summary.month}`,
        badge,
        preview: preview.length ? preview : null,
      });
    }
    case 'moves': {
      const { next48, taxes, schengen: sch } = raw;
      const schengenWarn = sch && sch.daysRemainingIn180 != null && sch.daysRemainingIn180 < 15;
      if (!next48.count && !taxes.length && !schengenWarn) return emptySection();
      const badge = next48.summary.critical ? 'alert' : (schengenWarn ? 'warn' : (next48.count || taxes.length ? 'info' : 'none'));
      const preview = [
        ...(next48.data || []).slice(0, 3).map(i => ({
          id: `log-${i.id}`,
          text: i.title || i.type || 'evento',
          meta: `T-${i.days_until}d · ${i.urgency}`,
        })),
        ...taxes.slice(0, 2).map(t => ({
          id: `tax-${t.id}`,
          text: `${t.name} (${t.country})`,
          meta: `${t.days_remaining}d`,
        })),
      ].slice(0, 5);
      return makeSection({
        kpi: next48.count,
        label: next48.count ? `${next48.count} en 48h` : (taxes.length ? `${taxes.length} deadlines` : 'sin movimientos'),
        badge,
        preview: preview.length ? preview : null,
      });
    }
    default: return emptySection();
  }
}

module.exports = router;
