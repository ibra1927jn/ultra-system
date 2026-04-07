// ╔══════════════════════════════════════════════════════════╗
// ║  Migrate `finances` table → Firefly III via REST API     ║
// ║                                                            ║
// ║  Idempotent: skip rows whose `id` already exists as       ║
// ║  external_id in Firefly. Re-runnable safely.               ║
// ║                                                            ║
// ║  Usage (inside container):                                 ║
// ║    docker compose exec engine node /app/scripts/migrate_finances_to_firefly.js
// ║  Pre-req:                                                  ║
// ║    1. docker compose --profile firefly up -d firefly_iii   ║
// ║    2. Register admin user via web (http://host:8080/)      ║
// ║    3. Profile → OAuth → Personal Access Tokens → create    ║
// ║    4. Set FIREFLY_PERSONAL_TOKEN in .env                   ║
// ║    5. Restart engine to pick up env                        ║
// ║    6. Run this script                                      ║
// ╚══════════════════════════════════════════════════════════╝

const db = require('../src/db');
const firefly = require('../src/firefly');

const DEFAULT_ASSET_ACCOUNT = process.env.FIREFLY_DEFAULT_ASSET || 'Cash';

async function ensureAccount(name, type = 'asset') {
  const existing = await firefly.listAccounts({ type });
  if (!existing.ok) throw new Error(`listAccounts: ${existing.error}`);
  const found = (existing.data?.data || []).find(a => a.attributes?.name === name);
  if (found) return found.id;
  const created = await firefly.createAccount({ name, type, currency_code: 'NZD' });
  if (!created.ok) throw new Error(`createAccount(${name}): ${created.error}`);
  return created.data.data.id;
}

async function migrate() {
  if (!firefly.isConfigured()) {
    console.error('❌ FIREFLY_PERSONAL_TOKEN not set. See docs/FIREFLY_MIGRATION.md');
    process.exit(1);
  }

  // Health check
  const about = await firefly.getAbout();
  if (!about.ok) {
    console.error('❌ Firefly III not reachable:', about.error);
    process.exit(1);
  }
  console.log(`✅ Firefly III ${about.data?.data?.version} reachable`);

  // Read all finances rows
  const rows = await db.queryAll(
    `SELECT id, type, amount, currency, amount_nzd, category, description, date, account, source, imported_id
     FROM finances
     ORDER BY date ASC, id ASC`
  );
  console.log(`📊 ${rows.length} rows in finances table`);

  if (rows.length === 0) {
    console.log('✅ Nothing to migrate (empty table). Bridge ready for new entries.');
    return;
  }

  // Pre-create distinct account names + categories
  const accountNames = [...new Set(rows.map(r => r.account || DEFAULT_ASSET_ACCOUNT))];
  console.log(`📋 ${accountNames.length} distinct accounts: ${accountNames.join(', ')}`);
  const accountIds = {};
  for (const name of accountNames) {
    try { accountIds[name] = await ensureAccount(name); }
    catch (err) { console.warn(`⚠️ ensureAccount(${name}):`, err.message); }
  }

  // Migrate row by row, skip if already migrated (external_id = "ultra:N")
  let inserted = 0, skipped = 0, errors = 0;
  for (const r of rows) {
    const externalId = `ultra:${r.id}`;
    const accountName = r.account || DEFAULT_ASSET_ACCOUNT;
    const isExpense = r.type === 'expense';

    const tx = await firefly.createTransaction({
      type: isExpense ? 'withdrawal' : 'deposit',
      amount: parseFloat(r.amount),
      currency_code: r.currency || 'NZD',
      description: r.description || `${r.type} ${r.category}`,
      date: r.date.toISOString ? r.date.toISOString().slice(0, 10) : r.date,
      category_name: r.category,
      source_name: isExpense ? accountName : (r.category || 'Income'),
      destination_name: isExpense ? r.category : accountName,
      external_id: externalId,
      tags: r.source ? [`source:${r.source}`] : null,
    });

    if (tx.ok) inserted++;
    else if (tx.error?.includes('Duplicate') || tx.error?.includes('already exists')) skipped++;
    else { errors++; if (errors < 5) console.warn(`row ${r.id}:`, tx.error?.slice(0, 100)); }
  }

  console.log(`✅ Migration done: inserted=${inserted}, skipped=${skipped}, errors=${errors}`);
}

migrate()
  .then(() => process.exit(0))
  .catch(err => { console.error('FATAL:', err); process.exit(1); });
