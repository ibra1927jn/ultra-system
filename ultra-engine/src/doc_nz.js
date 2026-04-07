// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — DOC NZ Open Data (P6)                    ║
// ║  ~250 campsites del Department of Conservation NZ        ║
// ║  Free, no auth, weekly refresh.                          ║
// ║                                                          ║
// ║  ESRI REST endpoint:                                     ║
// ║  https://services1.arcgis.com/.../doc_campsites/         ║
// ║   FeatureServer/0/query?where=1=1&f=geojson&outFields=*  ║
// ║                                                          ║
// ║  Fallback dataset URLs documentados en master doc.       ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

// Endpoint público ArcGIS DOC NZ campsites
// Verificado 2026-04-07 vía dcat-us feed de doc-deptconservation.opendata.arcgis.com
// Schema fields: name, place, region, campsiteCategory, free, facilities, bookable, etc.
const DOC_NZ_FEATURE = 'https://services1.arcgis.com/3JjYDyG3oajxU6HO/arcgis/rest/services/DOC_Campsites/FeatureServer/0/query';

/**
 * Fetch todos los DOC NZ campsites como GeoJSON y los persiste en log_pois.
 * Idempotente: ON CONFLICT (source, source_id) DO UPDATE.
 */
async function refreshAll() {
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    f: 'geojson',
    outSR: '4326',
    resultRecordCount: '500',
  });

  const res = await fetch(`${DOC_NZ_FEATURE}?${params}`, {
    headers: { 'User-Agent': 'UltraSystem/1.0' },
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new Error(`DOC NZ HTTP ${res.status}`);
  const data = await res.json();
  const features = data.features || [];

  let inserted = 0, updated = 0;
  for (const f of features) {
    const props = f.properties || {};
    const geom = f.geometry || {};
    if (geom.type !== 'Point') continue;
    const [lon, lat] = geom.coordinates || [];
    if (!lat || !lon) continue;

    const name = props.name || `DOC Campsite ${props.OBJECTID || ''}`;
    const sourceId = `doc-nz:${props.OBJECTID || name}`;
    const region = props.region || null;
    // DOC categoriza: Basic, Standard, Scenic, Serviced, Backcountry
    // Campo `free` real: "Yes" / "No" / null
    const isFree = props.free === 'Yes' || /basic|backcountry/i.test(props.campsiteCategory || '');
    const facilities = (props.facilities || '').toLowerCase();
    const hasWater = /water/i.test(facilities);
    const hasDump = /dump|sanitary/i.test(facilities);
    const hasShower = /shower/i.test(facilities);

    const r = await db.queryOne(
      `INSERT INTO log_pois
         (name, latitude, longitude, poi_type, country, region, source, source_id,
          is_free, has_water, has_dump, has_shower, tags)
       VALUES ($1, $2, $3, 'campsite', 'NZ', $4, 'doc_nz', $5,
         $6, $7, $8, $9, $10)
       ON CONFLICT (source, source_id) DO UPDATE SET
         name = EXCLUDED.name,
         latitude = EXCLUDED.latitude,
         longitude = EXCLUDED.longitude,
         region = EXCLUDED.region,
         is_free = EXCLUDED.is_free,
         has_water = EXCLUDED.has_water,
         has_dump = EXCLUDED.has_dump,
         has_shower = EXCLUDED.has_shower,
         tags = EXCLUDED.tags,
         fetched_at = NOW()
       RETURNING (xmax = 0) AS inserted`,
      [
        name.substring(0, 500),
        lat, lon,
        region,
        sourceId,
        isFree,
        hasWater,
        hasDump,
        hasShower,
        JSON.stringify(props),
      ]
    );
    if (r?.inserted) inserted++; else updated++;
  }

  console.log(`🏕️ [DOC NZ] ${inserted} new + ${updated} updated (de ${features.length})`);
  return { inserted, updated, total: features.length };
}

module.exports = { refreshAll };
