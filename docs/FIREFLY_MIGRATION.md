# Firefly III migration — manual setup steps

## Context

R5 (2026-04-07): adopt Firefly III as the primary ledger; keep the custom
`finances` table as a bridge/fallback. The bridge layer in
`ultra-engine/src/routes/finances.js` writes to BOTH locations when Firefly
is configured, falling back to local-only if Firefly is unreachable.

`ultra-engine/src/firefly.js` is a thin REST client; the schema migrations
are handled by Firefly itself on first boot.

## What's already done (automated)

- `docker-compose.yml` adds `firefly_iii` service under `--profile firefly`
- Firefly DB lives in the existing `ultra_db` Postgres container as a
  separate database `firefly_db` (no extra Postgres instance needed)
- `.env` has `FIREFLY_APP_KEY`, `FIREFLY_STATIC_TOKEN`, `FIREFLY_APP_URL`
  set; only `FIREFLY_PERSONAL_TOKEN` is empty (manual step below)
- Migration script `scripts/migrate_finances_to_firefly.js` ready to run
- Bridge layer in `routes/finances.js` GET / and POST / already wired

## Manual steps (one-time, ~5 minutes)

### 1. Boot Firefly III container

```bash
cd /root/ultra-system
docker compose --profile firefly up -d firefly_iii
```

Wait for healthy status:

```bash
docker compose ps firefly_iii
docker compose logs firefly_iii | tail -20
# Look for: "Firefly III should be ready for use."
```

### 2. Register admin user via web UI

Open in your browser:

```
http://95.217.158.7:8080/
```

(or `http://localhost:8080/` if you're tunneling/local-dev)

The first user to register **becomes the admin automatically**. Use a real
email (you'll receive password resets there) and a strong password. Skip
the demo data wizard if it appears — we'll import from `finances`.

### 3. Initial onboarding

After login, Firefly III walks you through:

- **Default currency**: select **NZD (New Zealand Dollar)** as default
- **Asset accounts**: create at least one (e.g., "Cash", "ASB Checking",
  "Wise NZD"). The migration script reads `account` field from `finances`
  rows so any name you use there will be auto-created if missing.
- Skip the rest of the wizard.

### 4. Generate Personal Access Token

In the Firefly III UI:

1. Top right → click your name → **Profile**
2. **OAuth** tab
3. Section "Personal Access Tokens" → **Create new token**
4. Name it `ultra-engine` (any name works)
5. Click "Create"
6. **Copy the token immediately** — Firefly only shows it once

### 5. Save token to `.env` and restart engine

```bash
# Edit .env, paste the token after FIREFLY_PERSONAL_TOKEN=
nano /root/ultra-system/.env

# Recreate engine to pick up the new env var
docker compose up -d engine
```

Verify the bridge sees the token:

```bash
docker compose exec engine node -e "
const ff = require('./src/firefly');
console.log('configured:', ff.isConfigured());
ff.getAbout().then(r => console.log(JSON.stringify(r.data?.data, null, 2)));
"
```

Should print `configured: true` and the Firefly version info.

### 6. Run the migration script (if you have data in `finances`)

```bash
docker compose exec engine node /app/scripts/migrate_finances_to_firefly.js
# (script vive en ultra-engine/scripts/ → se copia a /app/scripts/ en el container)
```

The script is **idempotent** — it tags each Firefly transaction with
`external_id = ultra:{row_id}`. Re-runs skip rows already migrated.

If `finances` is empty (current state, 0 rows as of 2026-04-07), the
script just confirms the bridge is ready and exits.

### 7. Test end-to-end

```bash
# Create a test transaction via the bridge
curl -X POST http://localhost/api/finances \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{"type":"expense","amount":12.50,"category":"Coffee","description":"Test","account":"Cash"}'

# Verify it appears in Firefly via API
docker compose exec engine node -e "
const ff = require('./src/firefly');
ff.listTransactions({limit:5}).then(r => console.log(JSON.stringify(r.data?.data?.[0]?.attributes?.transactions?.[0], null, 2)));
"

# Also check the local fallback table
docker exec ultra_db psql -U \$POSTGRES_USER -d \$POSTGRES_DB \
  -c "SELECT id, type, amount, category, description FROM finances ORDER BY id DESC LIMIT 3;"
```

Both should show the row.

## What stays in the custom ledger (NOT migrated to Firefly)

The bridge only forwards basic transactions. These remain in the custom DB
because Firefly III doesn't have direct equivalents:

- **Budgets** (`budgets` table) — Firefly III has its own budgets concept
  but with different semantics (envelope-style with rollover); we keep
  custom budget categories in sync manually if needed
- **Recurring detection** (`fin_recurring` table) — Firefly's recurring
  transactions are user-declared, ours are auto-detected from history
- **Savings goals** (`fin_savings_goals` table) — Firefly has piggy banks
  but linked to specific accounts; ours are standalone targets
- **Investments** (`fin_investments` + `fin_investment_history`) — Firefly
  has very basic investment tracking; ours has Stooq/Yahoo history + TWR
  + Sharpe + FIF NZ tax calc
- **Tax reporting** (Modelo 720/721/100, FIF NZ, Beckham, PAYE NZ) — all
  custom and remain so. Firefly III has zero tax features.
- **FX** (`fin_exchange_rates` + Frankfurter sync) — Firefly does some FX
  but not as flexible as our daily sync
- **Bank CSV import** (`bank_csv.js` profiles for ASB/ANZ/Westpac/BNZ/
  Kiwibank) — could eventually use Firefly Data Importer instead, but our
  parsers are working and tested

## How the bridge works

| Endpoint | Behavior with FIREFLY_PERSONAL_TOKEN set | Behavior without |
|---|---|---|
| `GET /api/finances` | Reads from Firefly III, returns FF3 shape mapped to local format. Header `x-source: firefly` | Reads from local `finances` table. Header `x-source: local` |
| `POST /api/finances` | Writes to BOTH local table (preserves budget/recurring) AND Firefly III. Returns local row + `firefly: {ok, firefly_id}` | Writes only to local. `firefly: null` |
| `GET /api/finances/budget`, `/recurring`, `/runway`, `/investments/*`, `/tax/*` | All use local DB only — Firefly III doesn't cover these | Same |

The bridge degrades gracefully: if Firefly is down or returns an error, the
local insert still succeeds and the response includes the FF3 error in the
`firefly` field for debugging. The user never sees a failure as long as
the local DB is healthy.

## Rollback

If you need to disable Firefly III entirely:

```bash
# Stop the container (data preserved in volume + firefly_db database)
docker compose stop firefly_iii

# Empty the token to force the bridge into local-only mode
sed -i 's|^FIREFLY_PERSONAL_TOKEN=.*|FIREFLY_PERSONAL_TOKEN=|' /root/ultra-system/.env
docker compose up -d engine
```

To fully remove (deletes Firefly data):

```bash
docker compose --profile firefly down -v firefly_iii
docker exec ultra_db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "DROP DATABASE firefly_db;"
```

## Future work

- [ ] Mirror local budgets to Firefly budgets (one-way sync)
- [ ] Auto-create Firefly accounts from bank_csv profiles on first import
- [ ] Webhooks: when Firefly receives a transaction via Data Importer
      (CSV/Spectre/Nordigen), notify the bridge so it backfills the local
      table for budgets/recurring
- [ ] Decide whether tax_reporting reads from Firefly (FF3 has aggregated
      data) or stays on local table
