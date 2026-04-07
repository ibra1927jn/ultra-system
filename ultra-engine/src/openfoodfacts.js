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

module.exports = { lookupBarcode, logFood };
