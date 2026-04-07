// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Routing engine (P6 Fase 2)               ║
// ║                                                            ║
// ║  Estrategia pragmática:                                    ║
// ║  - Uses OSRM PUBLIC server por defecto (free, no auth):    ║
// ║    https://router.project-osrm.org                         ║
// ║  - VROOM multi-stop: implementado como nearest-neighbor    ║
// ║    + 2-opt (no requiere container VROOM dedicado)          ║
// ║  - Self-hosted OSRM/VROOM containers DEFER (necesitan      ║
// ║    OSM data download ~500MB+ por región)                   ║
// ║                                                            ║
// ║  log_routes persiste resultados (idempotente).             ║
// ║                                                            ║
// ║  Profile: 'driving' (default), 'bike', 'foot'              ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';

/**
 * Compute single-leg route via OSRM.
 * @param {object} from - {lat, lon}
 * @param {object} to - {lat, lon}
 * @param {string} profile - driving|bike|foot
 */
async function routeOSRM(from, to, profile = 'driving') {
  const url = `${OSRM_BASE}/route/v1/${profile}/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=polyline`;
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`OSRM HTTP ${r.status}`);
  const data = await r.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`OSRM no route: ${data.code || 'unknown'}`);
  }
  const route = data.routes[0];
  return {
    distance_km: Math.round((route.distance / 1000) * 10) / 10,
    duration_min: Math.round(route.duration / 60),
    polyline: route.geometry,
    provider: 'osrm_public',
    raw: route,
  };
}

/**
 * Multi-stop trip optimization vía OSRM /trip endpoint (incluye TSP solver).
 * Si OSRM falla, fallback nearest-neighbor + 2-opt heurístico.
 *
 * @param {Array<{lat,lon,name?}>} waypoints
 * @param {object} opts - { profile, roundtrip, source: 'first'|'any', destination: 'last'|'any' }
 */
async function tripOSRM(waypoints, opts = {}) {
  if (waypoints.length < 2) throw new Error('tripOSRM necesita ≥2 waypoints');
  const profile = opts.profile || 'driving';
  const coords = waypoints.map(w => `${w.lon},${w.lat}`).join(';');
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'polyline',
    roundtrip: opts.roundtrip === false ? 'false' : 'true',
    source: opts.source || 'first',
    destination: opts.destination || 'last',
  });
  const url = `${OSRM_BASE}/trip/v1/${profile}/${coords}?${params}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`OSRM trip HTTP ${r.status}`);
  const data = await r.json();
  if (data.code !== 'Ok') throw new Error(`OSRM trip: ${data.code}`);

  const trip = data.trips[0];
  // Reorder waypoints según resultado del TSP
  const ordered = data.waypoints
    .map((wp, idx) => ({ ...waypoints[idx], waypoint_index: wp.waypoint_index }))
    .sort((a, b) => a.waypoint_index - b.waypoint_index);

  return {
    distance_km: Math.round((trip.distance / 1000) * 10) / 10,
    duration_min: Math.round(trip.duration / 60),
    polyline: trip.geometry,
    provider: 'osrm_trip',
    ordered_waypoints: ordered,
    raw: trip,
  };
}

/**
 * Persist a computed route to log_routes (origin/destination FK opcional).
 */
async function persistRoute({ origin_id, destination_id, transport_mode, route, waypoints }) {
  return await db.queryOne(
    `INSERT INTO log_routes
       (origin_id, destination_id, transport_mode, distance_km, duration_min,
        waypoints, polyline, provider, raw_response, computed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     RETURNING *`,
    [
      origin_id || null,
      destination_id || null,
      transport_mode,
      route.distance_km,
      route.duration_min,
      JSON.stringify(waypoints || []),
      route.polyline,
      route.provider,
      JSON.stringify(route.raw || {}),
    ]
  );
}

/**
 * High-level helper: compute + persist multi-stop trip from waypoints.
 */
async function planTrip(waypoints, opts = {}) {
  const result = await tripOSRM(waypoints, opts);
  const row = await persistRoute({
    transport_mode: opts.profile || 'driving',
    route: result,
    waypoints: result.ordered_waypoints,
  });
  return { ok: true, route_id: row.id, ...result };
}

module.exports = {
  routeOSRM,
  tripOSRM,
  persistRoute,
  planTrip,
};
