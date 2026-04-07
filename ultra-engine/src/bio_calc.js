// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Bio calculators (P7 R4 Tier A)            ║
// ║                                                            ║
// ║  Pure-math health/fitness calculators. No APIs externos,   ║
// ║  no DB writes (sólo el sleep score que lee bio_checks).    ║
// ║                                                            ║
// ║  Replaces gated alternatives:                              ║
// ║   - BMR/TDEE/Macros → MyFitnessPal (paid web)              ║
// ║   - Hydration → Waterllama (gated key)                     ║
// ║   - Sleep score → Oura/Whoop (paid hardware)               ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

// ────────────────────────────────────────────────────────────
//  BMR (Basal Metabolic Rate)
// ────────────────────────────────────────────────────────────
//  Mifflin-St Jeor (1990) — más preciso que Harris-Benedict para
//  la mayoría de adultos. Default por defecto.
//   Hombres: 10*W + 6.25*H − 5*A + 5
//   Mujeres: 10*W + 6.25*H − 5*A − 161
//
//  Harris-Benedict (revised 1984) — alternativa clásica:
//   Hombres: 88.362 + 13.397*W + 4.799*H − 5.677*A
//   Mujeres: 447.593 + 9.247*W + 3.098*H − 4.330*A
function computeBMR({ weight_kg, height_cm, age, sex = 'male', formula = 'mifflin' } = {}) {
  if (!weight_kg || !height_cm || !age) {
    return { error: 'weight_kg + height_cm + age requeridos' };
  }
  const W = parseFloat(weight_kg);
  const H = parseFloat(height_cm);
  const A = parseFloat(age);
  let bmr;
  if (formula === 'harris') {
    bmr = sex === 'female'
      ? 447.593 + 9.247 * W + 3.098 * H - 4.330 * A
      : 88.362 + 13.397 * W + 4.799 * H - 5.677 * A;
  } else {
    // mifflin (default)
    const offset = sex === 'female' ? -161 : 5;
    bmr = 10 * W + 6.25 * H - 5 * A + offset;
  }
  return { bmr_kcal: Math.round(bmr), formula, sex };
}

// ────────────────────────────────────────────────────────────
//  TDEE (Total Daily Energy Expenditure)
// ────────────────────────────────────────────────────────────
const ACTIVITY_MULTIPLIERS = {
  sedentary:    { mult: 1.2,    desc: 'desk job, no exercise' },
  light:        { mult: 1.375,  desc: 'light exercise 1-3 days/week' },
  moderate:     { mult: 1.55,   desc: 'moderate exercise 3-5 days/week' },
  active:       { mult: 1.725,  desc: 'hard exercise 6-7 days/week' },
  very_active:  { mult: 1.9,    desc: 'very hard exercise + physical job' },
};

function computeTDEE({ weight_kg, height_cm, age, sex = 'male', activity = 'moderate', formula = 'mifflin' } = {}) {
  const bmr = computeBMR({ weight_kg, height_cm, age, sex, formula });
  if (bmr.error) return bmr;
  const a = ACTIVITY_MULTIPLIERS[activity];
  if (!a) return { error: `activity must be one of: ${Object.keys(ACTIVITY_MULTIPLIERS).join(', ')}` };
  return {
    bmr_kcal: bmr.bmr_kcal,
    activity_level: activity,
    activity_multiplier: a.mult,
    activity_description: a.desc,
    tdee_kcal: Math.round(bmr.bmr_kcal * a.mult),
    formula,
    sex,
  };
}

// ────────────────────────────────────────────────────────────
//  Macros — split per goal
// ────────────────────────────────────────────────────────────
//  Cut: -20% kcal, 2.2 g/kg protein, 0.8 g/kg fat, rest carbs
//  Maintain: TDEE, 1.8 g/kg protein, 1.0 g/kg fat, rest carbs
//  Bulk: +15% kcal, 1.8 g/kg protein, 1.0 g/kg fat, rest carbs
//  (Convención evidence-based estándar bodybuilding nutrition.)
function computeMacros(opts) {
  const tdee = computeTDEE(opts);
  if (tdee.error) return tdee;
  const W = parseFloat(opts.weight_kg);
  const goal = opts.goal || 'maintain';
  const goalConfig = {
    cut:      { kcal_mult: 0.80, protein_g_per_kg: 2.2, fat_g_per_kg: 0.8 },
    maintain: { kcal_mult: 1.00, protein_g_per_kg: 1.8, fat_g_per_kg: 1.0 },
    bulk:     { kcal_mult: 1.15, protein_g_per_kg: 1.8, fat_g_per_kg: 1.0 },
  };
  const g = goalConfig[goal];
  if (!g) return { error: `goal must be one of: ${Object.keys(goalConfig).join(', ')}` };

  const targetKcal = Math.round(tdee.tdee_kcal * g.kcal_mult);
  const proteinG = Math.round(W * g.protein_g_per_kg);
  const fatG = Math.round(W * g.fat_g_per_kg);
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbsKcal = Math.max(0, targetKcal - proteinKcal - fatKcal);
  const carbsG = Math.round(carbsKcal / 4);

  return {
    ...tdee,
    goal,
    target_kcal: targetKcal,
    macros: {
      protein_g: proteinG,
      carbs_g: carbsG,
      fat_g: fatG,
      protein_kcal: proteinKcal,
      carbs_kcal: carbsG * 4,
      fat_kcal: fatKcal,
    },
    macro_split_pct: {
      protein: Math.round((proteinKcal / targetKcal) * 100),
      carbs: Math.round(((carbsG * 4) / targetKcal) * 100),
      fat: Math.round((fatKcal / targetKcal) * 100),
    },
  };
}

// ────────────────────────────────────────────────────────────
//  Hydration — daily water target
// ────────────────────────────────────────────────────────────
//  Baseline: 35 ml/kg body weight (ESPEN 2019 adult guideline).
//  +500 ml por hora de ejercicio.
//  +500 ml si temperatura ambiente > 27°C.
//  +500 ml si altitud > 2500m.
function computeHydration({ weight_kg, exercise_hours = 0, temp_c = 20, altitude_m = 0 } = {}) {
  if (!weight_kg) return { error: 'weight_kg requerido' };
  const W = parseFloat(weight_kg);
  let baseMl = Math.round(W * 35);
  let adjustments = [];

  const exerciseMl = Math.round(parseFloat(exercise_hours) * 500);
  if (exerciseMl > 0) adjustments.push({ reason: 'exercise', extra_ml: exerciseMl });

  let envMl = 0;
  if (temp_c > 27) { envMl += 500; adjustments.push({ reason: 'high_temp', extra_ml: 500 }); }
  if (altitude_m > 2500) { envMl += 500; adjustments.push({ reason: 'high_altitude', extra_ml: 500 }); }

  const totalMl = baseMl + exerciseMl + envMl;
  return {
    baseline_ml: baseMl,
    total_ml: totalMl,
    total_l: +(totalMl / 1000).toFixed(2),
    glasses_250ml: Math.ceil(totalMl / 250),
    adjustments,
    formula: '35 ml/kg + 500 ml/exercise hour + 500 ml if temp>27°C + 500 ml if alt>2500m',
  };
}

// ────────────────────────────────────────────────────────────
//  Sleep score — heurística sobre bio_checks
// ────────────────────────────────────────────────────────────
//  Score 0-100 ponderado:
//    sleep_hours    40% (target 7-9h)
//    sleep_quality  20% (1-10)
//    hrv            20% (>=baseline = 100)
//    rhr            20% (<=baseline = 100)
//  Si falta algún componente, redistribuye los pesos.
async function computeSleepScore({ date = null } = {}) {
  let row;
  if (date) {
    row = await db.queryOne(
      `SELECT * FROM bio_checks WHERE date = $1 ORDER BY id DESC LIMIT 1`,
      [date]
    );
  } else {
    row = await db.queryOne(
      `SELECT * FROM bio_checks ORDER BY date DESC, id DESC LIMIT 1`
    );
  }
  if (!row) return { error: 'no bio_checks rows found' };

  // Baselines: usar avg de últimos 30 días para HRV/RHR
  const baseline = await db.queryOne(
    `SELECT AVG(hrv) AS hrv_avg, AVG(heart_rate_avg) AS rhr_avg
     FROM bio_checks
     WHERE date >= CURRENT_DATE - INTERVAL '30 days'
       AND id != $1`,
    [row.id]
  );

  const components = {};
  let totalWeight = 0, weightedSum = 0;

  // sleep_hours (40%)
  if (row.sleep_hours != null) {
    const h = parseFloat(row.sleep_hours);
    let s;
    if (h >= 7 && h <= 9) s = 100;
    else if (h >= 6 && h < 7) s = 70 + (h - 6) * 30;       // 70-100 ramp
    else if (h > 9 && h <= 10) s = 100 - (h - 9) * 30;     // 100-70 ramp
    else if (h >= 5 && h < 6) s = 40 + (h - 5) * 30;       // 40-70 ramp
    else if (h > 10) s = Math.max(0, 70 - (h - 10) * 20);
    else s = Math.max(0, h * 8);
    components.sleep_hours = { value: h, score: Math.round(s), weight: 40 };
    totalWeight += 40; weightedSum += s * 40;
  }

  // sleep_quality (20%)
  if (row.sleep_quality != null) {
    const q = parseInt(row.sleep_quality);
    const s = (q / 10) * 100;
    components.sleep_quality = { value: q, score: Math.round(s), weight: 20 };
    totalWeight += 20; weightedSum += s * 20;
  }

  // hrv (20%)
  if (row.hrv != null && baseline?.hrv_avg) {
    const v = parseFloat(row.hrv);
    const b = parseFloat(baseline.hrv_avg);
    // 100 si v >= b, ramping linealmente hasta 0 si v == b/2
    const ratio = v / b;
    const s = Math.max(0, Math.min(100, (ratio - 0.5) * 200));
    components.hrv = { value: v, baseline: +b.toFixed(1), score: Math.round(s), weight: 20 };
    totalWeight += 20; weightedSum += s * 20;
  }

  // rhr (20%) — invertido: lower is better
  if (row.heart_rate_avg != null && baseline?.rhr_avg) {
    const v = parseFloat(row.heart_rate_avg);
    const b = parseFloat(baseline.rhr_avg);
    // 100 si v <= b, ramping hasta 0 si v == 1.5*b
    const ratio = v / b;
    const s = Math.max(0, Math.min(100, (1.5 - ratio) * 200));
    components.rhr = { value: v, baseline: +b.toFixed(1), score: Math.round(s), weight: 20 };
    totalWeight += 20; weightedSum += s * 20;
  }

  if (totalWeight === 0) {
    return { error: 'bio_checks row has no scoreable fields (sleep_hours/quality/hrv/rhr)', date: row.date };
  }

  const score = Math.round(weightedSum / totalWeight);
  let label;
  if (score >= 85) label = 'excellent';
  else if (score >= 70) label = 'good';
  else if (score >= 55) label = 'fair';
  else if (score >= 40) label = 'poor';
  else label = 'critical';

  return {
    date: row.date,
    score,
    label,
    components,
    notes_weight_used: totalWeight,
  };
}

module.exports = {
  computeBMR, computeTDEE, computeMacros, computeHydration, computeSleepScore,
  ACTIVITY_MULTIPLIERS,
};
