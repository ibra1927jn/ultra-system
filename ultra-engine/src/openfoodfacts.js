// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Open Food Facts client (P7 Fase 3a)      ║
// ║                                                            ║
// ║  Free public API, sin auth. Barcode lookup + nutrition.    ║
// ║  https://openfoodfacts.github.io/openfoodfacts-server/api/ ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const BASE = 'https://world.openfoodfacts.org/api/v2';

async function lookupBarcode(barcode) {
  if (!barcode || !/^\d{8,14}$/.test(String(barcode))) {
    throw new Error('barcode inválido (8-14 dígitos)');
  }
  const r = await fetch(`${BASE}/product/${barcode}.json`, {
    headers: { 'User-Agent': 'UltraSystem/1.0 (van-life nutrition tracker)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`OFF HTTP ${r.status}`);
  const data = await r.json();
  if (data.status !== 1) {
    return { ok: false, barcode, error: 'product not found' };
  }
  const p = data.product;
  const nutr = p.nutriments || {};
  return {
    ok: true,
    barcode,
    product: {
      name: p.product_name || p.product_name_en || 'unknown',
      brand: p.brands,
      categories: p.categories,
      ingredients: p.ingredients_text,
      serving_size: p.serving_size,
      nutriscore: p.nutriscore_grade,
      nova_group: p.nova_group,
      ecoscore: p.ecoscore_grade,
      nutriments_per_100g: {
        kcal: nutr['energy-kcal_100g'],
        protein_g: nutr.proteins_100g,
        carbs_g: nutr.carbohydrates_100g,
        sugar_g: nutr.sugars_100g,
        fat_g: nutr.fat_100g,
        sat_fat_g: nutr['saturated-fat_100g'],
        fiber_g: nutr.fiber_100g,
        salt_g: nutr.salt_100g,
        sodium_g: nutr.sodium_100g,
      },
      image_url: p.image_url,
    },
  };
}

/**
 * Cache lookup en bio_food_log para tracking pantry/consumo.
 * No persiste por defecto, solo si user llama POST con quantity_g.
 */
async function logFood({ barcode, quantity_g, meal, notes }) {
  if (!quantity_g) throw new Error('quantity_g requerido');
  const lookup = await lookupBarcode(barcode);
  if (!lookup.ok) throw lookup;
  const p = lookup.product;
  const factor = quantity_g / 100;
  const consumed = {
    kcal: (p.nutriments_per_100g.kcal || 0) * factor,
    protein_g: (p.nutriments_per_100g.protein_g || 0) * factor,
    carbs_g: (p.nutriments_per_100g.carbs_g || 0) * factor,
    fat_g: (p.nutriments_per_100g.fat_g || 0) * factor,
  };

  // Ensure table
  await db.query(`
    CREATE TABLE IF NOT EXISTS bio_food_log (
      id              SERIAL PRIMARY KEY,
      logged_at       TIMESTAMP DEFAULT NOW(),
      barcode         VARCHAR(20),
      product_name    VARCHAR(300),
      brand           VARCHAR(100),
      quantity_g      NUMERIC(8,2),
      meal            VARCHAR(20),
      kcal            NUMERIC(8,2),
      protein_g       NUMERIC(7,2),
      carbs_g         NUMERIC(7,2),
      fat_g           NUMERIC(7,2),
      nutriscore      VARCHAR(2),
      nova_group      INTEGER,
      notes           TEXT
    )
  `);

  const row = await db.queryOne(
    `INSERT INTO bio_food_log
       (barcode, product_name, brand, quantity_g, meal, kcal, protein_g, carbs_g, fat_g, nutriscore, nova_group, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [barcode, p.name, p.brand, quantity_g, meal || 'snack', consumed.kcal, consumed.protein_g, consumed.carbs_g, consumed.fat_g, p.nutriscore, p.nova_group, notes]
  );
  return { ok: true, log: row, consumed };
}

// ════════════════════════════════════════════════════════════
//  R4 P7 Tier A — Open Food Facts NL search (free, no auth)
//  Reemplaza CalorieNinjas (gated key). Devuelve top N matches con
//  nutrition_per_100g. El front llama después /food/log con barcode.
// ════════════════════════════════════════════════════════════
async function searchFood(query, { pageSize = 10 } = {}) {
  if (!query || query.length < 2) return { ok: false, error: 'query >= 2 chars required' };
  // OFF rate-limits ferozmente UAs no-browser. Mozilla UA pasa el filtro de
  // Cloudflare. Si recibimos 503, retry una vez tras 1.5s (back-off corto).
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=${pageSize}`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) UltraSystem/1.0',
    'Accept': 'application/json',
  };
  let r;
  try {
    r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (r.status === 503 || r.status === 429) {
      await new Promise(res => setTimeout(res, 1500));
      r = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    }
    if (!r.ok) throw new Error(`OFF HTTP ${r.status}`);
    // Defensive: si no es JSON (CF challenge HTML) report como rate-limited
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('json')) throw new Error('OFF returned non-JSON (CF rate-limit)');
    const data = await r.json();
    const products = (data.products || []).map(p => {
      const n = p.nutriments || {};
      return {
        barcode: p.code || p._id,
        name: p.product_name || p.product_name_en || p.product_name_es || p.generic_name || '?',
        brand: p.brands || null,
        quantity: p.quantity || null,
        nutrition_per_100g: {
          kcal: n['energy-kcal_100g'] || (n.energy_100g ? Math.round(n.energy_100g / 4.184) : null),
          protein_g: n.proteins_100g || null,
          carbs_g: n.carbohydrates_100g || null,
          fat_g: n.fat_100g || null,
          fiber_g: n.fiber_100g || null,
          sugar_g: n.sugars_100g || null,
          salt_g: n.salt_100g || null,
        },
        nutriscore: p.nutriscore_grade || null,
        image: p.image_thumb_url || null,
        url: p.code ? `https://world.openfoodfacts.org/product/${p.code}` : null,
      };
    });
    return { ok: true, count: data.count || products.length, results: products };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}


module.exports = { lookupBarcode, logFood, searchFood };
