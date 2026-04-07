// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Schengen 90/180 Calculator (P4 Fase 2)   ║
// ║                                                            ║
// ║  Regla: en cualquier período de 180 días, no puedes estar ║
// ║  en el Espacio Schengen más de 90 días totales.           ║
// ║  Calculado por la European Commission "short-stay calc":  ║
// ║  https://ec.europa.eu/assets/home/visa-calculator         ║
// ║                                                            ║
// ║  Para usuario dual ES/DZ: con pasaporte ES tiene libertad ║
// ║  de movimiento ilimitada (no aplica 90/180). Con DZ sí.   ║
// ║  Por eso bur_travel_log incluye `passport_used`.          ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

// 26 estados Schengen (a 2026-04). Excluye IE (CTA) y CY (no Schengen aún).
const SCHENGEN_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE',
  'GR', 'HU', 'IS', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL',
  'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'CH',
]);

const MS_PER_DAY = 86400000;

function toUTC(date) {
  // pg DATE columns return JS Date at local midnight; ISO strings 'YYYY-MM-DD'
  // we want to lock to the calendar date the user wrote, ignoring TZ.
  if (typeof date === 'string') {
    // 'YYYY-MM-DD' or full ISO — extract YMD
    const m = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(date);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  }
  const d = (date instanceof Date) ? date : new Date(date);
  // Use LOCAL components — pg returns local-midnight; user's Date input is local
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function isoDate(ms) {
  return new Date(ms).toISOString().split('T')[0];
}

function addDays(ms, days) {
  return ms + days * MS_PER_DAY;
}

function diffDaysInclusive(fromMs, toMs) {
  if (toMs < fromMs) return 0;
  return Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
}

/**
 * Calcula días Schengen usados en los 180 días anteriores a `targetDate`
 * (inclusive). Solo cuenta trips donde:
 *   - country pertenece a SCHENGEN_COUNTRIES
 *   - passport_used != 'ES' (con pasaporte EU no aplica 90/180)
 *
 * @param {Array} trips - filas de bur_travel_log
 * @param {Date|string} targetDate - fecha objetivo (default: hoy)
 * @returns {object} { days_used, days_remaining, window_start, window_end, breakdown }
 */
function computeSchengenUsage(trips, targetDate = new Date()) {
  const target = toUTC(targetDate);
  const windowStart = addDays(target, -179); // 180 días incluyendo target

  let daysUsed = 0;
  const breakdown = [];

  for (const trip of trips) {
    if (!SCHENGEN_COUNTRIES.has(trip.country)) continue;
    if (trip.passport_used === 'ES') continue; // EU citizen: ilimitado

    const entry = toUTC(trip.entry_date);
    const exit = trip.exit_date ? toUTC(trip.exit_date) : target;

    // Intersect [entry, exit] con [windowStart, target]
    const effEntry = Math.max(entry, windowStart);
    const effExit = Math.min(exit, target);

    if (effExit < effEntry) continue;

    const days = diffDaysInclusive(effEntry, effExit);
    daysUsed += days;
    breakdown.push({
      country: trip.country,
      entry: isoDate(entry),
      exit: trip.exit_date ? isoDate(exit) : null,
      days_in_window: days,
    });
  }

  return {
    target_date: isoDate(target),
    window_start: isoDate(windowStart),
    window_end: isoDate(target),
    days_used: daysUsed,
    days_remaining: Math.max(0, 90 - daysUsed),
    overstay: daysUsed > 90,
    breakdown,
  };
}

/**
 * Proyecta cuándo se puede empezar el próximo stay de N días en Schengen.
 * Itera día a día desde target hasta encontrar una ventana viable.
 * Limit: 365 días futuros.
 */
function projectNextEntryDate(trips, desiredDays = 90, fromDate = new Date()) {
  const start = toUTC(fromDate);
  for (let i = 0; i <= 365; i++) {
    const candidate = addDays(start, i);
    const usage = computeSchengenUsage(trips, new Date(candidate));
    if (usage.days_remaining >= desiredDays) {
      return {
        earliest_date: isoDate(candidate),
        days_available: usage.days_remaining,
        days_until: i,
      };
    }
  }
  return null;
}

/**
 * Helper async: lee bur_travel_log y computa para el target.
 */
async function getSchengenStatus(targetDate) {
  const trips = await db.queryAll(
    `SELECT country, area, entry_date, exit_date, purpose, passport_used, notes
     FROM bur_travel_log
     ORDER BY entry_date ASC`
  );
  const usage = computeSchengenUsage(trips, targetDate || new Date());
  let nextWindow = null;
  if (usage.days_remaining < 90) {
    nextWindow = projectNextEntryDate(trips, 90, targetDate || new Date());
  }
  return { ...usage, total_trips_logged: trips.length, next_full_90_window: nextWindow };
}

module.exports = {
  SCHENGEN_COUNTRIES,
  computeSchengenUsage,
  projectNextEntryDate,
  getSchengenStatus,
};
