// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Cross-pillar bridges (P3 Fase 2)         ║
// ║                                                            ║
// ║  Subscribe a eventos de P5/P6 → estimar impacto en runway ║
// ║  P3. Notifica vía Telegram cuando el delta es relevante.  ║
// ║                                                            ║
// ║  Eventos consumidos:                                       ║
// ║   - opp.won           (P5 → P3): suma estimada al runway  ║
// ║   - log.cost_logged   (P6 → P3): resta del runway         ║
// ║   - bur.travel_logged (P4 → P3): pre-estimar coste país   ║
// ║                                                            ║
// ║  Burn rate: media diaria de finances expense últimos 90d. ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');
const eventbus = require('./eventbus');
const telegram = require('./telegram');
const healthCheck = require('./health_destination_check');

let _initialized = false;

/**
 * Calcula burn rate diario promedio (NZD) en últimos 90 días.
 */
async function getBurnRate(days = 90) {
  const r = await db.queryOne(
    `SELECT COALESCE(SUM(COALESCE(amount_nzd, amount)) / NULLIF($1, 0), 0) AS daily_burn
     FROM finances
     WHERE type='expense'
       AND date >= CURRENT_DATE - INTERVAL '${parseInt(days, 10)} days'`,
    [days]
  );
  return Math.abs(parseFloat(r?.daily_burn || 0));
}

/**
 * Calcula runway days actual: cash NW / daily_burn.
 */
async function getCurrentRunway() {
  const nw = await db.queryOne(
    `SELECT total_nzd FROM fin_net_worth_snapshots ORDER BY date DESC LIMIT 1`
  );
  const burn = await getBurnRate(90);
  if (!nw || burn <= 0) return null;
  const cash = parseFloat(nw.total_nzd);
  return {
    cash_nzd: cash,
    daily_burn: Number(burn.toFixed(2)),
    runway_days: Math.floor(cash / burn),
  };
}

/**
 * Bridge handler: opportunity won → estimar impacto runway.
 * Espera payload: { opportunity_id, title, estimated_value_nzd }
 */
async function onOpportunityWon({ data }) {
  try {
    const value = parseFloat(data.estimated_value_nzd || 0);
    if (value <= 0) return;
    const runway = await getCurrentRunway();
    if (!runway) return;
    const extraDays = Math.floor(value / runway.daily_burn);
    const newRunway = runway.runway_days + extraDays;
    await telegram.sendAlert(
      `🎉 *Opportunity ganada → impacto runway*\n\n` +
      `*${data.title || 'Oportunidad'}*\n` +
      `💰 Valor: NZD ${value.toFixed(0)}\n\n` +
      `🛬 Runway actual: ${runway.runway_days}d\n` +
      `🚀 Runway nuevo: *${newRunway}d* (+${extraDays}d)\n` +
      `🔥 Burn rate: $${runway.daily_burn}/d`
    );
  } catch (err) {
    console.error('bridge onOpportunityWon error:', err.message);
  }
}

/**
 * Bridge handler: logistics cost logged → estimar impacto runway.
 * Espera payload: { logistics_id, type, cost_nzd, location }
 */
async function onLogisticsCost({ data }) {
  try {
    const cost = parseFloat(data.cost_nzd || 0);
    if (cost <= 0) return;
    const runway = await getCurrentRunway();
    if (!runway) return;
    const lostDays = Math.floor(cost / runway.daily_burn);
    // Solo alertar si cost > 100 NZD o > 1d runway
    if (cost < 100 && lostDays < 1) return;
    await telegram.sendAlert(
      `🗺️ *Logistics cost → runway impact*\n\n` +
      `${data.type || 'gasto'} ${data.location ? '@ ' + data.location : ''}\n` +
      `💸 Coste: NZD ${cost.toFixed(0)}\n\n` +
      `🛬 Runway actual: ${runway.runway_days}d\n` +
      `📉 Δ runway: -${lostDays}d`
    );
  } catch (err) {
    console.error('bridge onLogisticsCost error:', err.message);
  }
}

/**
 * Bridge handler: travel logged → pre-estimar coste destino.
 * (Por ahora solo alertar el log; la estimación de coste por país viene en P6 Fase 3)
 */
async function onTravelLogged({ data }) {
  try {
    const runway = await getCurrentRunway();
    if (runway) console.log(`bridge: travel ${data.country} logged, runway=${runway.runway_days}d, burn=${runway.daily_burn}/d`);

    // P7 ✕ P6: outbreak check on destination
    if (data.country) {
      const check = await healthCheck.checkDestination(data.country);
      if (check && (check.risk_level === 'high' || check.risk_level === 'critical' || check.vaccinations_missing.length > 0)) {
        const lines = [
          `🚨 *Health alert — destino ${check.country}*`,
          `⚠️ Risk level: *${check.risk_level.toUpperCase()}*`,
        ];
        if (check.vaccinations_missing.length > 0) {
          lines.push('', `💉 Vacunas recomendadas faltantes:`);
          for (const v of check.vaccinations_missing) lines.push(`  • ${v}`);
        }
        if (check.events.length > 0) {
          lines.push('', `🦠 Outbreaks recientes:`);
          for (const e of check.events.slice(0, 3)) lines.push(`  • [${e.severity}] ${e.title}`);
        }
        if (check.health_alerts.length > 0) {
          lines.push('', `📰 ${check.health_alerts.length} health alerts en últimos 30d`);
        }
        await telegram.sendAlert(lines.join('\n'));
      }
    }
  } catch (err) {
    console.error('bridge onTravelLogged error:', err.message);
  }
}

/**
 * Bridge handler P6: cuando logística añade trip con location
 * (también trigger via log.cost_logged si tiene country en title/location)
 */
async function onLogisticsTripPlanned({ data }) {
  try {
    if (!data.country) return;
    const check = await healthCheck.checkDestination(data.country);
    if (check && check.risk_level !== 'low') {
      console.log(`bridge: logistics trip → ${data.country} risk=${check.risk_level}, missing vaccs=${check.vaccinations_missing.length}`);
    }
  } catch (err) {
    console.error('bridge onLogisticsTripPlanned error:', err.message);
  }
}

function init() {
  if (_initialized) return;
  eventbus.subscribe('opp.won', onOpportunityWon);
  eventbus.subscribe('log.cost_logged', onLogisticsCost);
  eventbus.subscribe('bur.travel_logged', onTravelLogged);
  eventbus.subscribe('log.trip_planned', onLogisticsTripPlanned);
  _initialized = true;
  console.log('🌉 Cross-pillar bridges activos: opp.won, log.cost_logged, bur.travel_logged, log.trip_planned');
}

module.exports = {
  init,
  getBurnRate,
  getCurrentRunway,
  onOpportunityWon,
  onLogisticsCost,
  onTravelLogged,
};
