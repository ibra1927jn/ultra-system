// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — wger fitness API client (P7 Fase 3a)     ║
// ║                                                            ║
// ║  Container ultra_wger:8001 — 414+ ejercicios EN public.   ║
// ║  No auth para read endpoints. POST/PUT requiere token.    ║
// ║                                                            ║
// ║  Sync local cache de ejercicios → bio_exercises (cacheada ║
// ║  para evitar hit a wger en cada query).                    ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const BASE = process.env.WGER_BASE_URL || 'http://wger:8000';
const TOKEN = process.env.WGER_API_TOKEN || null;

function authHeaders() {
  return TOKEN ? { Authorization: `Token ${TOKEN}` } : {};
}

async function isReachable() {
  try {
    const r = await fetch(`${BASE}/api/v2/exerciseinfo/?limit=1`);
    return r.ok;
  } catch { return false; }
}

async function searchExercises({ q = '', limit = 20 } = {}) {
  // wger search endpoint /api/v2/exercise/search/?term=...&language=2 (en)
  const url = `${BASE}/api/v2/exercise/search/?term=${encodeURIComponent(q)}&language=2`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`wger search HTTP ${r.status}`);
  const data = await r.json();
  return (data.suggestions || []).slice(0, limit).map(s => ({
    id: s.data.id,
    name: s.value,
    category: s.data.category,
    image: s.data.image,
  }));
}

async function listExercises({ limit = 50, offset = 0, language = 2 } = {}) {
  const url = `${BASE}/api/v2/exerciseinfo/?limit=${limit}&offset=${offset}&language=${language}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`wger list HTTP ${r.status}`);
  const data = await r.json();
  return data.results || [];
}

async function getExercise(id) {
  const r = await fetch(`${BASE}/api/v2/exerciseinfo/${id}/`);
  if (!r.ok) throw new Error(`wger get HTTP ${r.status}`);
  return r.json();
}

/**
 * Sync wger exercises a tabla local bio_exercises.
 * Idempotente: ON CONFLICT update.
 */
async function syncExercises({ batchSize = 50, maxBatches = 10 } = {}) {
  // Ensure cache table exists
  await db.query(`
    CREATE TABLE IF NOT EXISTS bio_exercises (
      id              INTEGER PRIMARY KEY,
      uuid            VARCHAR(40),
      name            VARCHAR(200) NOT NULL,
      category        VARCHAR(100),
      muscles         JSONB,
      equipment       JSONB,
      description     TEXT,
      synced_at       TIMESTAMP DEFAULT NOW()
    )
  `);

  let total = 0, inserted = 0;
  for (let batch = 0; batch < maxBatches; batch++) {
    const exercises = await listExercises({ limit: batchSize, offset: batch * batchSize });
    if (!exercises.length) break;
    total += exercises.length;
    for (const ex of exercises) {
      // Get the EN translation if available
      const enTrans = (ex.translations || []).find(t => t.language === 2) || ex.translations?.[0];
      const name = enTrans?.name || ex.name || `exercise-${ex.id}`;
      const description = enTrans?.description || '';
      try {
        await db.query(
          `INSERT INTO bio_exercises (id, uuid, name, category, muscles, equipment, description, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
           ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, synced_at=NOW()`,
          [
            ex.id,
            ex.uuid,
            name.slice(0, 200),
            ex.category?.name || null,
            JSON.stringify(ex.muscles || []),
            JSON.stringify(ex.equipment || []),
            description.slice(0, 5000),
          ]
        );
        inserted++;
      } catch (err) {
        console.warn(`wger sync skip ${ex.id}:`, err.message);
      }
    }
    if (exercises.length < batchSize) break;
  }
  return { ok: true, fetched: total, inserted };
}

/**
 * Sync wger workout sessions del usuario autenticado → bio_journal.
 *
 * Cada workoutsession en wger se convierte en una row de bio_journal con:
 *   title  = "Workout {date}{?routine name}"
 *   body_md = markdown con date, impression, duration, notes
 *   tags    = ['workout', 'wger', f'wger:{id}']
 *
 * Idempotente: usa el wger session id en tags como discriminador (no hay
 * UNIQUE constraint en bio_journal). Por eso primero query si existe un row
 * con tag wger:{id} antes de insertar.
 *
 * Requiere WGER_API_TOKEN en .env (ver .env.example). Sin token, skip.
 */
async function syncWorkoutSessions({ limit = 50 } = {}) {
  if (!TOKEN) return { source: 'wger', skipped: 'WGER_API_TOKEN no configurado (.env)' };

  let r;
  try {
    r = await fetch(`${BASE}/api/v2/workoutsession/?ordering=-date&limit=${limit}`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) { return { source: 'wger', error: e.message }; }
  if (!r.ok) return { source: 'wger', error: `wger workoutsession HTTP ${r.status}` };

  const data = await r.json();
  const sessions = data.results || [];
  let inserted = 0, skipped = 0;

  for (const s of sessions) {
    const wgerTag = `wger:${s.id}`;
    // Idempotency check
    const existing = await db.queryOne(
      `SELECT id FROM bio_journal WHERE $1 = ANY(tags) LIMIT 1`,
      [wgerTag]
    );
    if (existing) { skipped++; continue; }

    // Compute duration if both times present
    let duration = '';
    if (s.time_start && s.time_end) {
      duration = ` (${s.time_start.slice(0, 5)}–${s.time_end.slice(0, 5)})`;
    }
    const impression = { 1: 'Bad', 2: 'Neutral', 3: 'Good' }[s.impression] || 'Unknown';
    const title = `Workout ${s.date}${duration}`.slice(0, 200);
    const body = [
      `**Date:** ${s.date}${duration}`,
      `**Impression:** ${impression}`,
      s.routine ? `**Routine:** #${s.routine}` : null,
      s.day ? `**Day:** #${s.day}` : null,
      s.notes ? `\n${s.notes}` : null,
    ].filter(Boolean).join('\n');

    await db.query(
      `INSERT INTO bio_journal (logged_at, title, body_md, tags)
       VALUES ($1, $2, $3, $4)`,
      [
        s.date ? new Date(s.date) : new Date(),
        title,
        body,
        ['workout', 'wger', wgerTag],
      ]
    );
    inserted++;
  }

  return { source: 'wger', total: sessions.length, inserted, skipped };
}

module.exports = { isReachable, searchExercises, listExercises, getExercise, syncExercises, syncWorkoutSessions };
