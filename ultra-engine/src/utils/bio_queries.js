/**
 * Shared SQL queries for bio-check data used by scheduler, telegram, and routes.
 */

const BIO_WEEKLY_SQL = `SELECT
  COUNT(*) AS entries,
  ROUND(AVG(sleep_hours)::numeric, 1) AS avg_sleep,
  ROUND(AVG(energy_level)::numeric, 1) AS avg_energy,
  ROUND(AVG(mood)::numeric, 1) AS avg_mood,
  ROUND(AVG(exercise_minutes)::numeric, 0) AS avg_exercise
FROM bio_checks
WHERE date >= CURRENT_DATE - 7`;

const BIO_CORRELATION_SQL = `SELECT sleep_hours, energy_level, mood, exercise_minutes
FROM bio_checks WHERE date >= CURRENT_DATE - 30 ORDER BY date DESC`;

module.exports = { BIO_WEEKLY_SQL, BIO_CORRELATION_SQL };
