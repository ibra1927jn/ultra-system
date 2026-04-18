const db = require('../db');
const schengen = require('../schengen');

// Lista deadlines fiscales con filtros opcionales.
// - country: ISO2 (case-insensitive) para filtrar por país
// - onlyUpcoming: si true, sólo deadlines >= hoy
// - daysAhead: si número, además filtra deadline <= hoy + N días
async function listTaxDeadlines({ country, onlyUpcoming = false, daysAhead = null } = {}) {
  const params = [];
  const where = ['is_active = TRUE'];
  if (country) {
    params.push(String(country).toUpperCase());
    where.push(`country = $${params.length}`);
  }
  if (onlyUpcoming || daysAhead != null) {
    where.push('deadline >= CURRENT_DATE');
  }
  if (daysAhead != null) {
    params.push(parseInt(daysAhead, 10));
    where.push(`deadline <= CURRENT_DATE + ($${params.length} || ' days')::interval`);
  }
  return db.queryAll(
    `SELECT id, country, name, description, deadline, recurring,
            recurrence_rule, alert_days_array, is_active, notes,
            (deadline - CURRENT_DATE) AS days_remaining,
            created_at, updated_at
     FROM bur_tax_deadlines
     WHERE ${where.join(' AND ')}
     ORDER BY deadline ASC`,
    params
  );
}

async function getSchengenStatus(date) {
  const target = date ? new Date(date) : new Date();
  if (isNaN(target.getTime())) throw new Error('date inválida');
  return schengen.getSchengenStatus(target);
}

module.exports = { listTaxDeadlines, getSchengenStatus };
