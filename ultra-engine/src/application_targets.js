// ╔══════════════════════════════════════════════════════════╗
// ║  ULTRA ENGINE — Manual Application Targets (P5 Tier A)    ║
// ║                                                            ║
// ║  Plataformas que NO tienen API pública pero son targets    ║
// ║  de aplicación manual con alto valor para el usuario:      ║
// ║   • Tech writing (DigitalOcean/Twilio/LogRocket/Draft.dev) ║
// ║   • AI training (Scale/Outlier/Surge/Appen)                ║
// ║   • Consulting (GLG/Expert360/Catalant/Codementor)         ║
// ║                                                            ║
// ║  Tracking: status (interested/applied/accepted/rejected),  ║
// ║  notes, application_date, payout_range.                    ║
// ║                                                            ║
// ║  Decisión 2026-04-07: BACKLOG items 74-87 son aplicaciones ║
// ║  manuales — se trackean como targets, no se polean.        ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('./db');

const SEED = [
  // ─── Tech writing ($300-$500 per article range) ───────────
  { category: 'tech_writing', name: 'DigitalOcean Write for DOnations', url: 'https://www.digitalocean.com/community/pages/write-for-digitalocean', payout_min: 300, payout_max: 500, currency: 'USD', notes: 'Docker, Node, Postgres = exact stack del usuario. Pitch propio.' },
  { category: 'tech_writing', name: 'Twilio Voices', url: 'https://www.twilio.com/blog/become-a-twilio-contributor', payout_min: 500, payout_max: 500, currency: 'USD', notes: 'APIs/Node tutorials' },
  { category: 'tech_writing', name: 'LogRocket Programming Blog', url: 'https://blog.logrocket.com/become-a-logrocket-guest-author/', payout_min: 300, payout_max: 500, currency: 'USD', notes: 'Node performance, frontend' },
  { category: 'tech_writing', name: 'Draft.dev', url: 'https://draft.dev/write', payout_min: 300, payout_max: 500, currency: 'USD', notes: 'Agency placements, easier entry' },
  { category: 'tech_writing', name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/write-for-us/', payout_min: 250, payout_max: 600, currency: 'USD', notes: 'Frontend, design, performance' },

  // ─── AI training ($15-$50/h, premium for Arabic) ──────────
  { category: 'ai_training', name: 'Scale AI', url: 'https://scale.com/work', payout_min: 10, payout_max: 50, currency: 'USD', notes: 'Per-task, premium $25-50/h Arabic. Apply via website.' },
  { category: 'ai_training', name: 'Outlier AI', url: 'https://outlier.ai/', payout_min: 15, payout_max: 50, currency: 'USD', notes: 'Arabic premium $30-50/h' },
  { category: 'ai_training', name: 'Surge AI', url: 'https://www.surgehq.ai/', payout_min: 15, payout_max: 40, currency: 'USD', notes: 'Arabic premium' },
  { category: 'ai_training', name: 'Appen', url: 'https://appen.com/jobs/', payout_min: 5, payout_max: 25, currency: 'USD', notes: 'Tarifas más bajas pero volumen alto' },
  { category: 'ai_training', name: 'Remotasks', url: 'https://www.remotasks.com/', payout_min: 5, payout_max: 30, currency: 'USD', notes: 'Scale AI subsidiary' },

  // ─── Consulting / Expert networks ──────────────────────────
  { category: 'consulting', name: 'GLG (Gerson Lehrman Group)', url: 'https://glginsights.com/network/', payout_min: 200, payout_max: 1000, currency: 'USD', notes: 'Per hour. Profile: blockchain/MENA/LatAm/dual-citizen NZ visa nomad' },
  { category: 'consulting', name: 'Expert360', url: 'https://expert360.com/freelancers', payout_min: 100, payout_max: 300, currency: 'AUD', notes: 'AU-focused. Software architecture/Node/AI' },
  { category: 'consulting', name: 'Catalant', url: 'https://gocatalant.com/experts/', payout_min: 100, payout_max: 300, currency: 'USD', notes: 'Enterprise consulting' },
  { category: 'consulting', name: 'Codementor', url: 'https://www.codementor.io/become-a-mentor', payout_min: 60, payout_max: 150, currency: 'USD', notes: '1:1 mentoring sessions' },
  { category: 'consulting', name: 'Toptal', url: 'https://www.toptal.com/talent/apply', payout_min: 60, payout_max: 200, currency: 'USD', notes: '3% acceptance rate, premium freelance' },

  // ─── Premium freelance platforms ───────────────────────────
  { category: 'freelance_premium', name: 'Arc.dev', url: 'https://arc.dev/freelance-jobs', payout_min: 50, payout_max: 200, currency: 'USD', notes: 'Vetted senior dev marketplace' },
  { category: 'freelance_premium', name: 'Lemon.io', url: 'https://lemon.io/for-developers/', payout_min: 35, payout_max: 100, currency: 'USD', notes: 'Senior developers' },
  { category: 'freelance_premium', name: 'Gun.io', url: 'https://www.gun.io/', payout_min: 80, payout_max: 200, currency: 'USD', notes: 'Vetted devs, US clients' },
];

async function ensureTable() {
  await db.query(
    `CREATE TABLE IF NOT EXISTS manual_application_targets (
       id SERIAL PRIMARY KEY,
       category TEXT NOT NULL,
       name TEXT NOT NULL,
       url TEXT NOT NULL,
       payout_min NUMERIC,
       payout_max NUMERIC,
       currency TEXT,
       status TEXT DEFAULT 'interested',
       application_date DATE,
       notes TEXT,
       last_followup DATE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE(category, name)
     )`
  );
  await db.query(`CREATE INDEX IF NOT EXISTS idx_mat_status ON manual_application_targets(status)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_mat_category ON manual_application_targets(category)`);
}

async function seed() {
  await ensureTable();
  let inserted = 0, skipped = 0;
  for (const t of SEED) {
    const r = await db.queryOne(
      `INSERT INTO manual_application_targets (category, name, url, payout_min, payout_max, currency, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (category, name) DO NOTHING RETURNING id`,
      [t.category, t.name, t.url, t.payout_min, t.payout_max, t.currency, t.notes]
    );
    if (r) inserted++; else skipped++;
  }
  return { inserted, skipped, total: SEED.length };
}

async function list({ category, status } = {}) {
  await ensureTable();
  const conds = [];
  const params = [];
  if (category) { params.push(category); conds.push(`category = $${params.length}`); }
  if (status)   { params.push(status);   conds.push(`status = $${params.length}`); }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return db.queryAll(`SELECT * FROM manual_application_targets ${where} ORDER BY category, payout_max DESC NULLS LAST, name`, params);
}

async function updateStatus(id, status, notes) {
  await ensureTable();
  return db.query(
    `UPDATE manual_application_targets
        SET status = $1,
            notes = COALESCE($2, notes),
            application_date = CASE WHEN $1 = 'applied' AND application_date IS NULL THEN CURRENT_DATE ELSE application_date END
      WHERE id = $3`,
    [status, notes || null, id]
  );
}

module.exports = { ensureTable, seed, list, updateStatus, SEED };
