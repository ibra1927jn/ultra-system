const db = require('../db');

async function getOpenHealthAlerts() {
  const recent = await db.queryOne(
    `SELECT
       COUNT(*) as entries,
       ROUND(AVG(sleep_hours)::numeric, 1) as avg_sleep,
       ROUND(AVG(energy_level)::numeric, 1) as avg_energy,
       ROUND(AVG(mood)::numeric, 1) as avg_mood,
       ROUND(AVG(exercise_minutes)::numeric, 0) as avg_exercise
     FROM bio_checks
     WHERE date >= CURRENT_DATE - 3`
  );
  const alerts = [];
  if (recent && parseInt(recent.entries) > 0) {
    const avgSleep = parseFloat(recent.avg_sleep);
    const avgEnergy = parseFloat(recent.avg_energy);
    const avgMood = parseFloat(recent.avg_mood);
    const avgExercise = parseFloat(recent.avg_exercise);

    if (avgSleep < 6) alerts.push({
      type: 'sleep',
      severity: avgSleep < 5 ? 'critical' : 'warning',
      message: `Promedio de sueno bajo: ${avgSleep}h (ultimos 3 dias). Minimo recomendado: 7h`,
    });
    if (avgEnergy < 4) alerts.push({
      type: 'energy',
      severity: avgEnergy < 3 ? 'critical' : 'warning',
      message: `Energia baja: ${avgEnergy}/10 (ultimos 3 dias). Revisa sueno y alimentacion`,
    });
    if (avgMood < 4) alerts.push({
      type: 'mood',
      severity: avgMood < 3 ? 'critical' : 'warning',
      message: `Animo bajo: ${avgMood}/10 (ultimos 3 dias). Considera un descanso o cambio de rutina`,
    });
    if (avgExercise < 10) alerts.push({
      type: 'exercise',
      severity: 'info',
      message: `Poco ejercicio: ${avgExercise} min/dia (ultimos 3 dias). Intenta moverte mas`,
    });
  }
  return { period: '3 dias', averages: recent, alerts, alert_count: alerts.length };
}

async function getRecentMood({ days = 30 } = {}) {
  const rows = await db.queryAll(
    `SELECT id, logged_at, mood, energy, anxiety, tags, notes
     FROM bio_mood
     WHERE logged_at >= NOW() - INTERVAL '${parseInt(days, 10)} days'
     ORDER BY logged_at DESC`
  );
  const avg = (k) => rows.length ? rows.reduce((a, r) => a + (parseFloat(r[k]) || 0), 0) / rows.length : null;
  return {
    count: rows.length,
    averages: rows.length ? { mood: avg('mood'), energy: avg('energy'), anxiety: avg('anxiety') } : null,
    data: rows,
  };
}

module.exports = { getOpenHealthAlerts, getRecentMood };
