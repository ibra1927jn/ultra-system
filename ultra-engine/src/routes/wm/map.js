const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../../db');
const router = express.Router();

// Static JSON cache (loaded from disk once, served many times)
const dataDir = path.join(__dirname, '../../../data');
const cache = {};
function loadJson(key) {
  if (!cache[key]) {
    try {
      const file = path.join(dataDir, `map-${key}.json`);
      cache[key] = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      console.warn(`⚠️ loadJson(${key}): ${err.message}`);
      return [];
    }
  }
  return cache[key];
}

router.get('/map/flights', async (req, res) => {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const results = {};

    if (type === 'all' || type === 'military') {
      const mil = await db.queryAll(`
        SELECT icao24, callsign, aircraft_type, operator, operator_country,
               lat, lon, altitude_ft, heading_deg, speed_kt, hotspot, confidence,
               observed_at
        FROM wm_military_flights
        WHERE observed_at >= NOW() - INTERVAL '2 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 3000
      `);
      results.military = mil;
    }

    if (type === 'all' || type === 'commercial') {
      const com = await db.queryAll(`
        SELECT icao24, callsign, origin_country, lat, lon,
               altitude_ft, heading_deg, speed_kt, region, observed_at
        FROM wm_commercial_flights
        WHERE observed_at >= NOW() - INTERVAL '2 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 3000
      `);
      results.commercial = com;
    }

    res.json({ ok: true, data: results });
  } catch (err) {
    console.error('❌ /api/wm/map/flights error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/vessels ─ Latest vessel snapshot ─────
// ?type=military|commercial|all (default all)
router.get('/map/vessels', async (req, res) => {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const results = {};

    if (type === 'all' || type === 'military') {
      const mil = await db.queryAll(`
        SELECT mmsi, vessel_name, vessel_type, operator, operator_country,
               lat, lon, heading_deg, speed_kt, near_chokepoint, near_base,
               confidence, observed_at
        FROM wm_military_vessels
        WHERE observed_at >= NOW() - INTERVAL '4 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 2000
      `);
      results.military = mil;
    }

    if (type === 'all' || type === 'commercial') {
      const com = await db.queryAll(`
        SELECT mmsi, vessel_name, category, flag_country,
               lat, lon, heading_deg, speed_kt, near_chokepoint,
               destination, observed_at
        FROM wm_commercial_vessels
        WHERE observed_at >= NOW() - INTERVAL '4 hours'
          AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT 2000
      `);
      results.commercial = com;
    }

    res.json({ ok: true, data: results });
  } catch (err) {
    console.error('❌ /api/wm/map/vessels error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/fires ─ Active fires last 24h ───────
router.get('/map/fires', async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 24, 72);
    const rows = await db.queryAll(`
      SELECT lat, lon, bright_ti4, frp, confidence, satellite, acq_date, acq_time,
             daynight, region
      FROM wm_satellite_fires
      WHERE observed_at >= NOW() - ($1::int * INTERVAL '1 hour')
        AND lat IS NOT NULL AND lon IS NOT NULL
      ORDER BY frp DESC NULLS LAST
      LIMIT 5000
    `, [hours]);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/fires error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ──��� GET /api/wm/map/quakes ─ Recent earthquakes ──────────
router.get('/map/quakes', async (req, res) => {
  try {
    const hours = Math.min(parseInt(req.query.hours, 10) || 48, 168);
    const rows = await db.queryAll(`
      SELECT usgs_id, magnitude, place, event_time, depth_km,
             lat, lon, alert_level, tsunami, felt, significance, url
      FROM wm_earthquakes
      WHERE event_time >= NOW() - ($1::int * INTERVAL '1 hour')
        AND lat IS NOT NULL AND lon IS NOT NULL
      ORDER BY magnitude DESC
      LIMIT 200
    `, [hours]);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/quakes error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/countries ─ Choropleth data ──────────
// Combines country sentiment, GDELT volume, CII scores
router.get('/map/countries', async (req, res) => {
  try {
    const [sentiment, gdelt, scores, alerts] = await Promise.all([
      db.queryAll(`
        SELECT country_iso2, article_count, positive_pct, neutral_pct,
               negative_pct, avg_score, period_date
        FROM wm_country_sentiment
        WHERE period_date >= CURRENT_DATE - INTERVAL '3 days'
        ORDER BY period_date DESC
      `),
      db.queryAll(`
        SELECT country, date, volume_intensity, avg_tone
        FROM wm_gdelt_geo_timeline
        WHERE date >= CURRENT_DATE - INTERVAL '3 days'
        ORDER BY date DESC
      `),
      db.queryAll(`
        SELECT code, name, score, level, trend, change_24h,
               component_unrest, component_conflict,
               component_security, component_information
        FROM wm_country_scores
        ORDER BY score DESC
      `),
      db.queryAll(`
        SELECT country, alert_date, current_volume, z_score, severity,
               top_title, top_url
        FROM wm_gdelt_volume_alerts
        WHERE alert_date >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY z_score DESC
      `)
    ]);

    res.json({ ok: true, data: { sentiment, gdelt, scores, alerts } });
  } catch (err) {
    console.error('❌ /api/wm/map/countries error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/events ─ Geopolitical events ────────
router.get('/map/events', async (req, res) => {
  try {
    const rows = await db.queryAll(`
      SELECT e.id, e.event_type, e.actors, e.action, e.location,
             e.location_geo, e.event_date, e.confidence,
             c.headline as cluster_headline, c.article_count
      FROM wm_events e
      LEFT JOIN wm_event_clusters c ON c.id = e.cluster_id
      WHERE e.created_at >= NOW() - INTERVAL '72 hours'
      ORDER BY e.created_at DESC
      LIMIT 200
    `);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/events error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/wm/map/outages ─ Internet outages ──────���───
router.get('/map/outages', async (req, res) => {
  try {
    const rows = await db.queryAll(`
      SELECT * FROM wm_internet_outages
      WHERE last_seen_at >= NOW() - INTERVAL '48 hours'
      ORDER BY last_seen_at DESC
      LIMIT 50
    `);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/outages error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════
//  STATIC LAYERS — pre-extracted JSON (cached in memory at top of file)
// ═══════════════════════════════════════════════════════════

router.get('/map/bases', (req, res) => {
  const data = loadJson('bases');
  const type = req.query.type;
  const filtered = type ? data.filter(b => b.type === type) : data;
  res.json({ ok: true, count: filtered.length, data: filtered });
});

router.get('/map/pipelines', (req, res) => {
  const data = loadJson('pipelines');
  const type = req.query.type;
  const filtered = type ? data.filter(p => p.type === type) : data;
  res.json({ ok: true, count: filtered.length, data: filtered });
});

router.get('/map/ports', (req, res) => {
  res.json({ ok: true, count: loadJson('ports').length, data: loadJson('ports') });
});

router.get('/map/hotspots', (req, res) => {
  res.json({ ok: true, count: loadJson('hotspots').length, data: loadJson('hotspots') });
});

router.get('/map/nuclear', (req, res) => {
  res.json({ ok: true, count: loadJson('nuclear').length, data: loadJson('nuclear') });
});

router.get('/map/cables', (req, res) => {
  res.json({ ok: true, count: loadJson('cables').length, data: loadJson('cables') });
});

router.get('/map/waterways', (req, res) => {
  res.json({ ok: true, count: loadJson('waterways').length, data: loadJson('waterways') });
});

router.get('/map/economic', (req, res) => {
  res.json({ ok: true, count: loadJson('economic').length, data: loadJson('economic') });
});

router.get('/map/conflicts', (req, res) => {
  res.json({ ok: true, count: loadJson('conflicts').length, data: loadJson('conflicts') });
});

router.get('/map/disasters', async (req, res) => {
  try {
    const rows = await db.queryAll(`
      SELECT id, source, event_id, category, title, description,
             lat, lon, event_date, magnitude, magnitude_unit,
             alert_level, country, source_url, closed
      FROM wm_natural_events
      WHERE closed = false OR last_seen >= NOW() - INTERVAL '72 hours'
      ORDER BY event_date DESC
      LIMIT 200
    `);
    res.json({ ok: true, count: rows.length, data: rows });
  } catch (err) {
    console.error('❌ /api/wm/map/disasters error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

router.get('/map/geojson', (req, res) => {
  if (!cache.geojson) {
    try {
      cache.geojson = JSON.parse(fs.readFileSync(path.join(dataDir, 'ne_110m_countries.geojson'), 'utf8'));
    } catch (err) {
      console.warn(`⚠️ geojson load failed: ${err.message}`);
      return res.status(500).json({ ok: false, error: 'geojson data unavailable' });
    }
  }
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(cache.geojson);
});

module.exports = router;
