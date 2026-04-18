// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — API: Logistica (P6)                      ║
// ║  Gestion transporte/alojamiento + alertas 48h + costos   ║
// ╚══════════════════════════════════════════════════════════╝

const express = require('express');
const db = require('../db');

const router = express.Router();

// ─── GET /api/logistics ─ Listar items ──────────────────
router.get('/', async (req, res) => {
  try {
    const { type, status, limit } = req.query;
    let sql = 'SELECT * FROM logistics WHERE 1=1';
    const params = [];

    if (type) {
      params.push(type);
      sql += ` AND type = $${params.length}`;
    }

    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ' ORDER BY date ASC';
    params.push(parseInt(limit) || 50);
    sql += ` LIMIT $${params.length}`;

    const rows = await db.queryAll(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/upcoming ─ Proximos 7 dias ──────
router.get('/upcoming', async (req, res) => {
  try {
    // Ventana default 90d (antes 7d — demasiado corto para nómada que
    // planifica con meses de antelación). ?days=N override, clamp [1, 365].
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 90));
    const rows = await db.queryAll(
      `SELECT *, (date - CURRENT_DATE) AS days_until
       FROM logistics
       WHERE date >= CURRENT_DATE
       AND date <= CURRENT_DATE + ($1 || ' days')::INTERVAL
       AND status != 'done'
       ORDER BY date ASC`,
      [String(days)]
    );
    res.json({ ok: true, data: rows, window_days: days });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  SMART ALERTS — Proximas 48 horas con urgencia
// ═══════════════════════════════════════════════════════════

// ─── GET /api/logistics/next48h ─ Items en 48 horas ─────
router.get('/next48h', async (req, res) => {
  try {
    const result = await require('../domain/logistics').getNext48h();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/costs ─ Gastos por ubicacion/tipo ─
router.get('/costs', async (req, res) => {
  try {
    // Gastos agrupados por tipo
    const byType = await db.queryAll(
      `SELECT type,
         COUNT(*) as count,
         COALESCE(SUM(cost), 0) as total_cost,
         ROUND(COALESCE(AVG(cost), 0)::numeric, 2) as avg_cost
       FROM logistics
       WHERE cost > 0
       GROUP BY type
       ORDER BY total_cost DESC`
    );

    // Gastos agrupados por ubicacion
    const byLocation = await db.queryAll(
      `SELECT
         COALESCE(location, 'Sin ubicacion') as location,
         COUNT(*) as count,
         COALESCE(SUM(cost), 0) as total_cost
       FROM logistics
       WHERE cost > 0
       GROUP BY location
       ORDER BY total_cost DESC`
    );

    // Total general
    const totals = await db.queryOne(
      `SELECT
         COUNT(*) as total_items,
         COALESCE(SUM(cost), 0) as total_cost,
         ROUND(COALESCE(AVG(cost), 0)::numeric, 2) as avg_cost
       FROM logistics
       WHERE cost > 0`
    );

    res.json({
      ok: true,
      data: {
        by_type: byType,
        by_location: byLocation,
        totals: {
          items: parseInt(totals.total_items),
          total_cost: parseFloat(totals.total_cost),
          avg_cost: parseFloat(totals.avg_cost),
        },
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics ─ Crear item ───────────────────
// ═══════════════════════════════════════════════════════════
//  P6 FASE 2 — Routing (OSRM) + Traccar GPS
// ═══════════════════════════════════════════════════════════
const routing = require('../routing');
const traccar = require('../traccar');

// ─── POST /api/logistics/route ─ Compute single-leg route ──
router.post('/route', async (req, res) => {
  try {
    const { from, to, profile, persist } = req.body;
    if (!from?.lat || !from?.lon || !to?.lat || !to?.lon) {
      return res.status(400).json({ ok: false, error: 'from{lat,lon} y to{lat,lon} requeridos' });
    }
    const r = await routing.routeOSRM(from, to, profile || 'driving');
    if (persist) {
      const row = await routing.persistRoute({
        transport_mode: profile || 'driving',
        route: r,
        waypoints: [from, to],
      });
      r.route_id = row.id;
    }
    res.json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics/trip ─ Multi-stop TSP optimization ──
router.post('/trip', async (req, res) => {
  try {
    const { waypoints, profile, roundtrip, source, destination } = req.body;
    if (!Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ ok: false, error: 'waypoints array (≥2) requerido' });
    }
    const result = await routing.planTrip(waypoints, { profile, roundtrip, source, destination });
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/routes ─ Listar routes computadas ──
router.get('/routes', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, transport_mode, distance_km, duration_min, provider,
              cost, currency, computed_at
       FROM log_routes ORDER BY computed_at DESC NULLS LAST LIMIT 30`
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics/gps/sync ─ Pull from Traccar ──
router.post('/gps/sync', async (req, res) => {
  try {
    const result = await traccar.syncPositions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/gps/last ─ Última posición conocida ──
router.get('/gps/last', async (req, res) => {
  try {
    const { device_id } = req.query;
    const pos = await traccar.getLastPosition(device_id);
    res.json({ ok: true, data: pos });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/poi/export.geojson ─ Offline export ──
// Para van-life: exporta los log_pois locales como GeoJSON listo
// para importar en apps offline (Locus Map, Maps.me, OruxMaps, etc.)
router.get('/poi/export.geojson', async (req, res) => {
  try {
    const { type, country } = req.query;
    const where = ['latitude IS NOT NULL', 'longitude IS NOT NULL'];
    const params = [];
    if (type) {
      params.push(type);
      where.push(`poi_type = $${params.length}`);
    }
    if (country) {
      params.push(country.toUpperCase());
      where.push(`country = $${params.length}`);
    }
    const rows = await db.queryAll(
      `SELECT id, name, poi_type, latitude, longitude, country, is_free, has_water, has_dump, has_shower, source
       FROM log_pois
       WHERE ${where.join(' AND ')}
       LIMIT 5000`,
      params
    );
    const features = rows.map(r => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(r.longitude), parseFloat(r.latitude)] },
      properties: {
        id: r.id,
        name: r.name,
        type: r.poi_type,
        free: r.is_free,
        water: r.has_water,
        dump: r.has_dump,
        shower: r.has_shower,
        source: r.source,
      },
    }));
    res.set('Content-Type', 'application/geo+json');
    res.set('Content-Disposition', 'attachment; filename="ultra_pois.geojson"');
    res.json({
      type: 'FeatureCollection',
      generated_at: new Date().toISOString(),
      count: features.length,
      features,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/poi/along-route ─ POIs cerca de polyline ──
// Query params: route_id (de log_routes), max_distance_km (default 5)
// Devuelve POIs dentro de N km de cualquier punto del polyline
router.get('/poi/along-route', async (req, res) => {
  try {
    const { route_id, max_distance_km = 5, type } = req.query;
    if (!route_id) return res.status(400).json({ ok: false, error: 'route_id requerido' });
    const route = await db.queryOne(
      'SELECT id, polyline, raw_response FROM log_routes WHERE id = $1',
      [route_id]
    );
    if (!route?.polyline) return res.status(404).json({ ok: false, error: 'route sin polyline' });

    // Decode Google polyline → coords
    const coords = decodePolyline(route.polyline);
    if (!coords.length) return res.status(400).json({ ok: false, error: 'polyline inválido' });

    // Bounding box para pre-filter
    const lats = coords.map(c => c[0]);
    const lons = coords.map(c => c[1]);
    const bbox = {
      minLat: Math.min(...lats), maxLat: Math.max(...lats),
      minLon: Math.min(...lons), maxLon: Math.max(...lons),
    };
    const padding = 0.5; // ~50km en degrees
    const where = [
      `latitude BETWEEN ${bbox.minLat - padding} AND ${bbox.maxLat + padding}`,
      `longitude BETWEEN ${bbox.minLon - padding} AND ${bbox.maxLon + padding}`,
    ];
    const params = [];
    if (type) {
      params.push(type);
      where.push(`poi_type = $${params.length}`);
    }
    const candidates = await db.queryAll(
      `SELECT id, name, poi_type, latitude, longitude, is_free FROM log_pois WHERE ${where.join(' AND ')} LIMIT 2000`,
      params
    );

    // Haversine + min distance to polyline
    const maxKm = parseFloat(max_distance_km);
    const matches = [];
    for (const p of candidates) {
      let minDist = Infinity;
      const pLat = parseFloat(p.latitude), pLon = parseFloat(p.longitude);
      for (const c of coords) {
        const d = haversineKm(pLat, pLon, c[0], c[1]);
        if (d < minDist) minDist = d;
        if (minDist <= maxKm) break;
      }
      if (minDist <= maxKm) matches.push({ ...p, distance_km: Number(minDist.toFixed(2)) });
    }
    matches.sort((a, b) => a.distance_km - b.distance_km);
    res.json({ ok: true, route_id, max_distance_km: maxKm, count: matches.length, data: matches });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Google polyline algo decoder
function decodePolyline(str) {
  const coords = [];
  let lat = 0, lng = 0, idx = 0;
  while (idx < str.length) {
    let shift = 0, result = 0, byte;
    do { byte = str.charCodeAt(idx++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { byte = str.charCodeAt(idx++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

// ─── GET /api/logistics/gps/track ─ Track históricas ──
router.get('/gps/track', async (req, res) => {
  try {
    const { device_id, limit } = req.query;
    const where = device_id ? 'WHERE device_id = $1' : '';
    const params = device_id ? [device_id] : [];
    params.push(parseInt(limit || '100', 10));
    const rows = await db.queryAll(
      `SELECT device_id, lat, lon, speed_kmh, altitude, fix_time
       FROM log_gps_positions ${where}
       ORDER BY fix_time DESC LIMIT $${params.length}`,
      params
    );
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { type, title, date, location, notes, status, cost } = req.body;

    if (!type || !title || !date) {
      return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios: type, title, date' });
    }

    const validTypes = ['transport', 'accommodation', 'visa', 'appointment'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ ok: false, error: 'type debe ser transport, accommodation, visa o appointment' });
    }

    const validStatuses = ['pending', 'confirmed', 'done'];
    const finalStatus = validStatuses.includes(status) ? status : 'pending';

    const result = await db.queryOne(
      `INSERT INTO logistics (type, title, date, location, notes, status, cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [type, title, date, location || null, notes || null, finalStatus, parseFloat(cost) || 0]
    );

    // P3 bridge: si tiene cost > 0, publicar evento para impacto runway
    const numericCost = parseFloat(cost) || 0;
    if (numericCost > 0) {
      const eventbus = require('../eventbus');
      await eventbus.publish('log.cost_logged', 'P6', {
        logistics_id: result.id,
        type: result.type,
        cost_nzd: numericCost,
        location: result.location,
        title: result.title,
      });
    }

    // Invalida cache del home aggregator (también money si hay cost > 0).
    const homeCache = require('../domain/home-cache');
    homeCache.invalidate('moves.');
    if (numericCost > 0) homeCache.invalidate('money.');

    res.status(201).json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PATCH /api/logistics/:id ─ Actualizar item ─────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, title, date, location, notes, status, cost } = req.body;

    const result = await db.queryOne(
      `UPDATE logistics SET
       type = COALESCE($1, type),
       title = COALESCE($2, title),
       date = COALESCE($3, date),
       location = COALESCE($4, location),
       notes = COALESCE($5, notes),
       status = COALESCE($6, status),
       cost = COALESCE($7, cost)
       WHERE id = $8
       RETURNING *`,
      [type, title, date, location, notes, status, cost != null ? parseFloat(cost) : null, id]
    );

    if (!result) return res.status(404).json({ ok: false, error: 'Item no encontrado' });
    res.json({ ok: true, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  P6 Phase 1 Quick Win — POI / Weather / Memberships / Kiwi
// ═══════════════════════════════════════════════════════════
const overpass = require('../overpass');
const weatherMod = require('../weather');
const docNz = require('../doc_nz');
const kiwi = require('../kiwi');

// ─── GET /api/logistics/poi ─ POIs cerca ─────────────────
// ?lat=&lon=&radius_km=&type=campsite|water|dump_station|...&refresh=true
router.get('/poi', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    const radius = parseFloat(req.query.radius_km || 20);
    const poiType = req.query.type || null;
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ ok: false, error: 'lat y lon requeridos (numeric)' });
    }
    // Si refresh=true, fuerza fetch de Overpass para los tipos relevantes
    let fetched = null;
    if (req.query.refresh === 'true' && poiType) {
      fetched = await overpass.fetchNearby(lat, lon, poiType, radius);
    }
    const rows = await overpass.listNearby(lat, lon, radius, poiType);
    res.json({ ok: true, count: rows.length, fetched, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics/poi/refresh ─ Fetch + cache ─────
router.post('/poi/refresh', async (req, res) => {
  try {
    const { lat, lon, types, radius_km = 20 } = req.body;
    if (!lat || !lon) return res.status(400).json({ ok: false, error: 'lat/lon requeridos' });
    const wantedTypes = types || ['campsite', 'water', 'dump_station', 'fuel'];
    const results = {};
    for (const t of wantedTypes) {
      try {
        results[t] = await overpass.fetchNearby(lat, lon, t, radius_km);
      } catch (err) {
        results[t] = { error: err.message };
      }
    }
    res.json({ ok: true, data: results });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/weather ─ Forecast 7d ────────────
// ?lat=&lon=&refresh=true
router.get('/weather', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ ok: false, error: 'lat/lon requeridos' });
    }
    if (req.query.refresh === 'true') {
      await weatherMod.fetchForecast(lat, lon);
    }
    let rows = await weatherMod.getForecast(lat, lon);
    if (rows.length === 0) {
      // Lazy fetch
      await weatherMod.fetchForecast(lat, lon);
      rows = await weatherMod.getForecast(lat, lon);
    }
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/memberships ─ Lista subscriptions ─
router.get('/memberships', async (req, res) => {
  try {
    const rows = await db.queryAll(
      `SELECT id, platform, annual_cost, currency, renews_at, last_paid_at,
        auto_renew, notes, is_active,
        CASE WHEN renews_at IS NULL THEN NULL ELSE (renews_at - CURRENT_DATE) END AS days_to_renewal
       FROM log_memberships ORDER BY renews_at ASC NULLS LAST`
    );
    res.json({ ok: true, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── PUT /api/logistics/memberships/:id ──────────────────
router.put('/memberships/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { platform, annual_cost, currency, renews_at, last_paid_at, auto_renew, notes, is_active } = req.body;
    const row = await db.queryOne(
      `UPDATE log_memberships SET
         platform = COALESCE($1, platform),
         annual_cost = COALESCE($2, annual_cost),
         currency = COALESCE($3, currency),
         renews_at = COALESCE($4, renews_at),
         last_paid_at = COALESCE($5, last_paid_at),
         auto_renew = COALESCE($6, auto_renew),
         notes = COALESCE($7, notes),
         is_active = COALESCE($8, is_active),
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [platform, annual_cost, currency, renews_at, last_paid_at, auto_renew, notes, is_active, id]
    );
    if (!row) return res.status(404).json({ ok: false, error: 'Membership no encontrada' });
    res.json({ ok: true, data: row });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── POST /api/logistics/doc-nz/refresh ─ Fetch DOC NZ ───
router.post('/doc-nz/refresh', async (req, res) => {
  try {
    const r = await docNz.refreshAll();
    res.json({ ok: true, data: r });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/logistics/kiwi/status ─ Wise/Kiwi config ───
router.get('/kiwi/status', (req, res) => {
  res.json({ ok: true, configured: kiwi.isConfigured() });
});

module.exports = router;
