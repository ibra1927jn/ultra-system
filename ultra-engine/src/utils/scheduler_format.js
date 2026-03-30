/**
 * Pure formatting functions extracted from scheduler.js for testability.
 */

/**
 * Progress bar renderer for bio summaries.
 * @param {number|string} val - Value 0-10
 * @returns {string} 10-char bar of █ and ░
 */
function bar(val) {
  const filled = Math.min(10, Math.max(0, Math.round(parseFloat(val))));
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

/**
 * Format budget alert lines from alert rows and financial data.
 * @param {{ month: string, remaining: number, runway: number, alerts: Array }} data
 * @returns {string[]} Formatted message lines
 */
function formatBudgetAlert({ month, remaining, runway, alerts }) {
  const lines = [
    '⚠️ *ULTRA SYSTEM — Alerta de Presupuesto*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📅 ${month} | 💵 Restante: $${remaining.toFixed(2)} | ⏳ Runway: ${runway} dias`,
    '',
  ];

  for (const a of alerts) {
    const emoji = parseFloat(a.percent_used) >= 100 ? '🔴' : '🟡';
    lines.push(`${emoji} *${a.category}*: $${parseFloat(a.spent).toFixed(2)} / $${parseFloat(a.monthly_limit).toFixed(2)} (${a.percent_used}%)`);
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

/**
 * Format opportunity reminder lines.
 * @param {{ deadlines: Array, followUps: Array }} data
 * @returns {string[]} Formatted message lines
 */
function formatOpportunityReminders({ deadlines, followUps }) {
  const lines = [
    '🎯 *ULTRA SYSTEM — Recordatorios*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  if (deadlines.length) {
    lines.push('', '📅 *Deadlines proximos:*');
    for (const d of deadlines) {
      const urgency = d.days_until === 0 ? '🔴 HOY' : d.days_until === 1 ? '🟡 MANANA' : `🟢 en ${d.days_until} dias`;
      lines.push(`   ${urgency} — *${d.title}*`);
    }
  }

  if (followUps.length) {
    lines.push('', '📧 *Necesitan follow-up (>7 dias):*');
    for (const f of followUps) {
      lines.push(`   ⏰ *${f.title}* — ${f.days_since} dias sin respuesta`);
      if (f.source) lines.push(`      📍 ${f.source}`);
    }
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

/**
 * Format logistics 48h alert lines.
 * @param {Array} items - Logistics items with type, title, location, days_until, status
 * @returns {string[]} Formatted message lines
 */
function formatLogisticsNext48h(items) {
  const typeEmoji = { transport: '🚌', accommodation: '🏠', visa: '🛂', appointment: '📋' };
  const urgencyMap = { 0: '🔴 HOY', 1: '🟡 MANANA', 2: '🟢 Pasado manana' };

  const lines = [
    '🗺️ *ULTRA SYSTEM — Logistica 48h*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
  ];

  for (const item of items) {
    const emoji = typeEmoji[item.type] || '📌';
    const urgency = urgencyMap[item.days_until] || '📌';
    const statusIcon = item.status === 'confirmed' ? '✅' : '⏳';

    lines.push(`${urgency} ${emoji} ${statusIcon} *${item.title}*`);
    if (item.location) lines.push(`   📍 ${item.location}`);
    lines.push('');
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━');
  return lines;
}

/**
 * Format bio weekly summary lines.
 * @param {{ weekly: object, correlations: Array|null }} data
 * @returns {string[]} Formatted message lines
 */
function formatBioWeeklySummary({ weekly, correlations }) {
  const lines = [
    '🧬 *ULTRA SYSTEM — Bio Resumen Semanal*',
    '━━━━━━━━━━━━━━━━━━━━━━━━',
    `📊 Registros: ${weekly.entries}/7`,
    '',
    `😴 Sueno: ${weekly.avg_sleep}h`,
    `⚡ Energia: ${bar(weekly.avg_energy)} ${weekly.avg_energy}/10`,
    `😊 Animo: ${bar(weekly.avg_mood)} ${weekly.avg_mood}/10`,
    `🏃 Ejercicio: ${weekly.avg_exercise} min/dia`,
  ];

  const avgSleep = parseFloat(weekly.avg_sleep);
  const avgEnergy = parseFloat(weekly.avg_energy);
  const avgMood = parseFloat(weekly.avg_mood);

  if (avgSleep < 6) lines.push('', `⚠️ Sueno bajo (${avgSleep}h) — prioriza descanso`);
  if (avgEnergy < 4) lines.push(`⚠️ Energia baja (${avgEnergy}/10) — revisa alimentacion`);
  if (avgMood < 4) lines.push(`⚠️ Animo bajo (${avgMood}/10) — considera un descanso`);

  if (correlations && correlations.length > 0) {
    lines.push('', '📈 *Correlaciones (30 dias):*');
    for (const c of correlations) {
      if (c.val !== null) {
        const arrow = c.val > 0 ? '↑' : '↓';
        const strength = Math.abs(c.val) >= 0.7 ? '💪' : Math.abs(c.val) >= 0.4 ? '📊' : '〰️';
        lines.push(`${strength} ${c.label}: ${c.val} ${arrow}`);
      }
    }
  }

  lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🤖 _Enviado por Ultra Engine_');
  return lines;
}

module.exports = {
  bar,
  formatBudgetAlert,
  formatOpportunityReminders,
  formatLogisticsNext48h,
  formatBioWeeklySummary,
};
