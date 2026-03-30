/**
 * Pure function to generate bio health alerts from averaged metrics.
 * Extracted from routes/bio.js for testability.
 *
 * @param {{ avg_sleep: number, avg_energy: number, avg_mood: number, avg_exercise: number }} averages
 * @returns {Array<{ type: string, severity: string, message: string }>}
 */
function generateBioAlerts(averages) {
  const alerts = [];
  const { avg_sleep, avg_energy, avg_mood, avg_exercise } = averages;

  if (avg_sleep < 6) {
    alerts.push({
      type: 'sleep',
      severity: avg_sleep < 5 ? 'critical' : 'warning',
      message: `Promedio de sueno bajo: ${avg_sleep}h (ultimos 3 dias). Minimo recomendado: 7h`,
    });
  }

  if (avg_energy < 4) {
    alerts.push({
      type: 'energy',
      severity: avg_energy < 3 ? 'critical' : 'warning',
      message: `Energia baja: ${avg_energy}/10 (ultimos 3 dias). Revisa sueno y alimentacion`,
    });
  }

  if (avg_mood < 4) {
    alerts.push({
      type: 'mood',
      severity: avg_mood < 3 ? 'critical' : 'warning',
      message: `Animo bajo: ${avg_mood}/10 (ultimos 3 dias). Considera un descanso o cambio de rutina`,
    });
  }

  if (avg_exercise < 10) {
    alerts.push({
      type: 'exercise',
      severity: 'info',
      message: `Poco ejercicio: ${avg_exercise} min/dia (ultimos 3 dias). Intenta moverte mas`,
    });
  }

  return alerts;
}

module.exports = { generateBioAlerts };
