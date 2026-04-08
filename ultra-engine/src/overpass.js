// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Overpass API (P6)                        ║
// ║  POIs OSM cerca de una coordenada (free, no auth)        ║
// ║                                                          ║
// ║  Tags soportados (van-life centric):                     ║
// ║   tourism=camp_site / caravan_site                       ║
// ║   amenity=drinking_water / water_point                   ║
// ║   amenity=sanitary_dump_station                          ║
// ║   amenity=shower / toilets / fuel                        ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// Mapeo poi_type → query Overpass tag
const POI_QUERIES = {
  campsite: '["tourism"~"^(camp_site|caravan_site)$"]',
  water: '["amenity"~"^(drinking_water|water_point)$"]',
  dump_station: '["amenity"="sanitary_dump_station"]',
  shower: '["amenity"="shower"]',
  toilets: '["amenity"="toilets"]',
  fuel: '["amenity"="fuel"]',
};

/**
 * Query Overpass para POIs de un tipo en un radio (km) alrededor de coord.
 * Persiste en log_pois con source='osm' y source_id=osm:nodeid.
 */
async function fetchNearby(latitude, longitude, poiType, radiusKm = 20) {
  const tag = POI_QUERIES[poiType];
  if (!tag) throw new Error(`Tipo POI desconocido: ${poiType}`);

  const radiusM = Math.round(radiusKm * 1000);
  const query = `
    [out:json][timeout:25];
    (
      node${tag}(around:${radiusM},${latitude},${longitude});
      way${tag}(around:${radiusM},${latitude},${longitude});
    );
    out center 100;
  `;

  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'UltraSystem/1.0',
    },
    body: 'data=' + encodeURIComponent(query),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  const data = await res.json();
  const elements = data.elements || [];

  let inserted = 0;
  for (const el of elements) {
    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;
    if (!lat || !lon) continue;
    const tags = el.tags || {};
    const name = tags.name || tags['name:en'] || `${poiType} ${el.id}`;
    const sourceId = `osm:${el.type}:${el.id}`;

    const r = await db.queryOne(
      `INSERT INTO log_pois (name, latitude, longitude, poi_type, source, source_id, tags, has_water, has_dump, has_shower, has_power)
       VALUES ($1, $2, $3, $4, 'osm', $5, $6,
         $7, $8, $9, $10)
       ON CONFLICT (source, source_id) DO UPDATE SET
         name = EXCLUDED.name,
         tags = EXCLUDED.tags,
         fetched_at = NOW()
       RETURNING id`,
      [
        name.substring(0, 500),
        lat, lon,
        poiType,
        sourceId,
        JSON.stringify(tags),
        tags.drinking_water === 'yes' || poiType === 'water',
        tags.sanitary_dump_station === 'yes' || poiType === 'dump_station',
        tags.shower === 'yes' || poiType === 'shower',
        tags.power_supply === 'yes',
      ]
    );
    if (r) inserted++;
  }
  return { inserted, total: elements.length };
}

/**
 * Haversine: distancia en km entre 2 coordenadas.
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Lista POIs en radio (km) usando bounding box pre-filter + Haversine refinamiento.
 * Sin PostGIS — pure SQL + JS.
 */
async function listNearby(latitude, longitude, radiusKm = 20, poiType = null, source = null) {
  // Bounding box aproximada (1° lat ≈ 111 km, 1° lon ≈ 111 * cos(lat) km)
  const dLat = radiusKm / 111;
  const dLon = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));

  const params = [latitude - dLat, latitude + dLat, longitude - dLon, longitude + dLon];
  let where = 'latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4';
  if (poiType) {
    params.push(poiType);
    where += ` AND poi_type = $${params.length}`;
  }
  if (source) {
    params.push(source);
    where += ` AND source = $${params.length}`;
  }

  const rows = await db.queryAll(
    `SELECT id, name, latitude, longitude, poi_type, source, has_water, has_dump, has_shower, has_wifi, has_power, tags, notes
     FROM log_pois WHERE ${where} ORDER BY id DESC LIMIT 500`,
    params
  );

  // Refinamiento por distancia exacta
  const enriched = rows.map(r => ({
    ...r,
    distance_km: Math.round(haversineKm(latitude, longitude, parseFloat(r.latitude), parseFloat(r.longitude)) * 10) / 10,
  }))
  .filter(r => r.distance_km <= radiusKm)
  .sort((a, b) => a.distance_km - b.distance_km);

  return enriched;
}

module.exports = { fetchNearby, listNearby, haversineKm, POI_QUERIES };
