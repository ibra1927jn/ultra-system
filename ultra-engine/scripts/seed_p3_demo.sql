-- ╔══════════════════════════════════════════════════════════╗
-- ║  Seed datos demo P3 Finanzas — idempotente               ║
-- ║  Perfil: Ibrahim (ES/DZ, digital nomad NZ, WHV)          ║
-- ║  90 días de actividad realista                            ║
-- ╚══════════════════════════════════════════════════════════╝

BEGIN;

-- ─── Limpiar seeds previos (marcados con source='seed') ───
DELETE FROM finances WHERE source = 'seed';
DELETE FROM fin_recurring WHERE payee_normalized IN ('Spotify','Netflix','Vodafone NZ','PureGym','Rent Auckland','Notion','GitHub Copilot');
DELETE FROM fin_savings_goals WHERE name IN ('Emergency Fund','Travel — South America 2027','House Deposit ES');
DELETE FROM fin_crypto_holdings WHERE notes = 'seed:demo';
DELETE FROM fin_investments WHERE notes = 'seed:demo';
DELETE FROM budgets WHERE category IN ('rent','groceries','transport','eating_out','subscriptions','utilities','travel');

-- ─── BUDGETS (monthly limits NZD) ───
INSERT INTO budgets (category, monthly_limit) VALUES
  ('rent', 1800),
  ('groceries', 600),
  ('transport', 250),
  ('eating_out', 350),
  ('subscriptions', 80),
  ('utilities', 180),
  ('travel', 500)
ON CONFLICT (category) DO UPDATE SET monthly_limit = EXCLUDED.monthly_limit;

-- ─── INCOME (salary + freelance over 3 months) ───
-- Salary 4500 NZD/mo × 3 + freelance occasional
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('income', 4500, 'NZD', 4500, 'salary',   'Salary — Tech NZ Co',         CURRENT_DATE - 88, 'ASB Everyday',  'seed'),
  ('income', 4500, 'NZD', 4500, 'salary',   'Salary — Tech NZ Co',         CURRENT_DATE - 58, 'ASB Everyday',  'seed'),
  ('income', 4500, 'NZD', 4500, 'salary',   'Salary — Tech NZ Co',         CURRENT_DATE - 28, 'ASB Everyday',  'seed'),
  ('income', 1250, 'EUR', 2275, 'freelance','Cliente ES — consultoría',     CURRENT_DATE - 70, 'Wise EUR',      'seed'),
  ('income',  890, 'USD', 1530, 'freelance','GitHub Sponsors',              CURRENT_DATE - 45, 'Wise USD',      'seed'),
  ('income', 1500, 'EUR', 2730, 'freelance','Cliente ES — sprint backend',  CURRENT_DATE - 15, 'Wise EUR',      'seed');

-- ─── EXPENSES — rent ───
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('expense', 1800, 'NZD', 1800, 'rent', 'Rent Auckland CBD',  CURRENT_DATE - 85, 'ASB Everyday', 'seed'),
  ('expense', 1800, 'NZD', 1800, 'rent', 'Rent Auckland CBD',  CURRENT_DATE - 55, 'ASB Everyday', 'seed'),
  ('expense', 1800, 'NZD', 1800, 'rent', 'Rent Auckland CBD',  CURRENT_DATE - 25, 'ASB Everyday', 'seed');

-- ─── EXPENSES — groceries (semanales, ~$140/sem) ───
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('expense', 142, 'NZD', 142, 'groceries', 'Countdown Auckland', CURRENT_DATE - 87, 'ASB Everyday', 'seed'),
  ('expense', 138, 'NZD', 138, 'groceries', 'Countdown Auckland', CURRENT_DATE - 80, 'ASB Everyday', 'seed'),
  ('expense', 156, 'NZD', 156, 'groceries', 'New World',          CURRENT_DATE - 73, 'ASB Everyday', 'seed'),
  ('expense', 124, 'NZD', 124, 'groceries', 'Countdown Auckland', CURRENT_DATE - 66, 'ASB Everyday', 'seed'),
  ('expense', 148, 'NZD', 148, 'groceries', 'Pak''nSave',         CURRENT_DATE - 59, 'ASB Everyday', 'seed'),
  ('expense', 162, 'NZD', 162, 'groceries', 'New World',          CURRENT_DATE - 52, 'ASB Everyday', 'seed'),
  ('expense', 135, 'NZD', 135, 'groceries', 'Countdown Auckland', CURRENT_DATE - 45, 'ASB Everyday', 'seed'),
  ('expense', 144, 'NZD', 144, 'groceries', 'Countdown Auckland', CURRENT_DATE - 38, 'ASB Everyday', 'seed'),
  ('expense', 158, 'NZD', 158, 'groceries', 'Pak''nSave',         CURRENT_DATE - 31, 'ASB Everyday', 'seed'),
  ('expense', 122, 'NZD', 122, 'groceries', 'Countdown Auckland', CURRENT_DATE - 24, 'ASB Everyday', 'seed'),
  ('expense', 167, 'NZD', 167, 'groceries', 'New World',          CURRENT_DATE - 17, 'ASB Everyday', 'seed'),
  ('expense', 134, 'NZD', 134, 'groceries', 'Countdown Auckland', CURRENT_DATE - 10, 'ASB Everyday', 'seed'),
  ('expense', 149, 'NZD', 149, 'groceries', 'Countdown Auckland', CURRENT_DATE -  3, 'ASB Everyday', 'seed');

-- ─── EXPENSES — eating out ───
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('expense', 32, 'NZD', 32, 'eating_out', 'Cafe Allpress',    CURRENT_DATE - 84, 'ASB Everyday', 'seed'),
  ('expense', 48, 'NZD', 48, 'eating_out', 'Ramen restaurant', CURRENT_DATE - 78, 'ASB Everyday', 'seed'),
  ('expense', 65, 'NZD', 65, 'eating_out', 'Sushi night',      CURRENT_DATE - 71, 'ASB Everyday', 'seed'),
  ('expense', 24, 'NZD', 24, 'eating_out', 'Brunch Ponsonby',  CURRENT_DATE - 64, 'ASB Everyday', 'seed'),
  ('expense', 95, 'NZD', 95, 'eating_out', 'Tapas + drinks',   CURRENT_DATE - 50, 'ASB Everyday', 'seed'),
  ('expense', 38, 'NZD', 38, 'eating_out', 'Burger Burger',    CURRENT_DATE - 42, 'ASB Everyday', 'seed'),
  ('expense', 55, 'NZD', 55, 'eating_out', 'Thai dinner',      CURRENT_DATE - 33, 'ASB Everyday', 'seed'),
  ('expense', 42, 'NZD', 42, 'eating_out', 'Pizza',            CURRENT_DATE - 21, 'ASB Everyday', 'seed'),
  ('expense', 78, 'NZD', 78, 'eating_out', 'Date night',       CURRENT_DATE - 12, 'ASB Everyday', 'seed'),
  ('expense', 35, 'NZD', 35, 'eating_out', 'Lunch viaduct',    CURRENT_DATE -  5, 'ASB Everyday', 'seed');

-- ─── EXPENSES — transport ───
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('expense', 65, 'NZD', 65, 'transport', 'AT HOP topup',  CURRENT_DATE - 80, 'ASB Everyday', 'seed'),
  ('expense', 70, 'NZD', 70, 'transport', 'AT HOP topup',  CURRENT_DATE - 50, 'ASB Everyday', 'seed'),
  ('expense', 28, 'NZD', 28, 'transport', 'Uber',          CURRENT_DATE - 38, 'ASB Everyday', 'seed'),
  ('expense', 75, 'NZD', 75, 'transport', 'AT HOP topup',  CURRENT_DATE - 20, 'ASB Everyday', 'seed'),
  ('expense', 32, 'NZD', 32, 'transport', 'Uber airport',  CURRENT_DATE -  8, 'ASB Everyday', 'seed');

-- ─── EXPENSES — utilities ───
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('expense', 145, 'NZD', 145, 'utilities', 'Mercury power+gas',  CURRENT_DATE - 75, 'ASB Everyday', 'seed'),
  ('expense', 168, 'NZD', 168, 'utilities', 'Mercury power+gas',  CURRENT_DATE - 45, 'ASB Everyday', 'seed'),
  ('expense', 152, 'NZD', 152, 'utilities', 'Mercury power+gas',  CURRENT_DATE - 15, 'ASB Everyday', 'seed');

-- ─── EXPENSES — subscriptions (recurring) ───
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('expense', 17.99, 'NZD', 17.99, 'subscriptions', 'Spotify Premium',  CURRENT_DATE - 88, 'ASB Everyday', 'seed'),
  ('expense', 17.99, 'NZD', 17.99, 'subscriptions', 'Spotify Premium',  CURRENT_DATE - 58, 'ASB Everyday', 'seed'),
  ('expense', 17.99, 'NZD', 17.99, 'subscriptions', 'Spotify Premium',  CURRENT_DATE - 28, 'ASB Everyday', 'seed'),
  ('expense', 27.99, 'NZD', 27.99, 'subscriptions', 'Netflix Standard', CURRENT_DATE - 86, 'ASB Everyday', 'seed'),
  ('expense', 27.99, 'NZD', 27.99, 'subscriptions', 'Netflix Standard', CURRENT_DATE - 56, 'ASB Everyday', 'seed'),
  ('expense', 27.99, 'NZD', 27.99, 'subscriptions', 'Netflix Standard', CURRENT_DATE - 26, 'ASB Everyday', 'seed'),
  ('expense', 12.00, 'NZD', 12.00, 'subscriptions', 'Notion Plus',      CURRENT_DATE - 84, 'ASB Everyday', 'seed'),
  ('expense', 12.00, 'NZD', 12.00, 'subscriptions', 'Notion Plus',      CURRENT_DATE - 54, 'ASB Everyday', 'seed'),
  ('expense', 12.00, 'NZD', 12.00, 'subscriptions', 'Notion Plus',      CURRENT_DATE - 24, 'ASB Everyday', 'seed'),
  ('expense', 16.50, 'NZD', 16.50, 'subscriptions', 'GitHub Copilot',   CURRENT_DATE - 82, 'ASB Everyday', 'seed'),
  ('expense', 16.50, 'NZD', 16.50, 'subscriptions', 'GitHub Copilot',   CURRENT_DATE - 52, 'ASB Everyday', 'seed'),
  ('expense', 16.50, 'NZD', 16.50, 'subscriptions', 'GitHub Copilot',   CURRENT_DATE - 22, 'ASB Everyday', 'seed'),
  ('expense', 65.00, 'NZD', 65.00, 'subscriptions', 'Vodafone NZ mobile', CURRENT_DATE - 80, 'ASB Everyday', 'seed'),
  ('expense', 65.00, 'NZD', 65.00, 'subscriptions', 'Vodafone NZ mobile', CURRENT_DATE - 50, 'ASB Everyday', 'seed'),
  ('expense', 65.00, 'NZD', 65.00, 'subscriptions', 'Vodafone NZ mobile', CURRENT_DATE - 20, 'ASB Everyday', 'seed'),
  ('expense', 39.00, 'NZD', 39.00, 'subscriptions', 'PureGym membership', CURRENT_DATE - 78, 'ASB Everyday', 'seed'),
  ('expense', 39.00, 'NZD', 39.00, 'subscriptions', 'PureGym membership', CURRENT_DATE - 48, 'ASB Everyday', 'seed'),
  ('expense', 39.00, 'NZD', 39.00, 'subscriptions', 'PureGym membership', CURRENT_DATE - 18, 'ASB Everyday', 'seed');

-- ─── EXPENSES — travel ───
INSERT INTO finances (type, amount, currency, amount_nzd, category, description, date, account, source) VALUES
  ('expense', 320, 'NZD', 320, 'travel', 'Wellington weekend flights', CURRENT_DATE - 60, 'ASB Everyday', 'seed'),
  ('expense', 180, 'NZD', 180, 'travel', 'AirBnb Wellington',          CURRENT_DATE - 60, 'ASB Everyday', 'seed'),
  ('expense', 240, 'EUR', 437, 'travel', 'Vuelo Madrid (visa run)',    CURRENT_DATE - 30, 'Wise EUR',     'seed');

-- ─── RECURRING (detected manually for demo) ───
INSERT INTO fin_recurring (payee_normalized, frequency, amount_avg, currency, next_expected, last_seen, confidence, sample_size, avg_interval_days, confirmed) VALUES
  ('Spotify',         'monthly', 17.99, 'NZD', CURRENT_DATE +  2, CURRENT_DATE - 28, 0.98, 3, 30.0, true),
  ('Netflix',         'monthly', 27.99, 'NZD', CURRENT_DATE +  4, CURRENT_DATE - 26, 0.98, 3, 30.0, true),
  ('Notion',          'monthly', 12.00, 'NZD', CURRENT_DATE +  6, CURRENT_DATE - 24, 0.97, 3, 30.0, false),
  ('GitHub Copilot',  'monthly', 16.50, 'NZD', CURRENT_DATE +  8, CURRENT_DATE - 22, 0.97, 3, 30.0, true),
  ('Vodafone NZ',     'monthly', 65.00, 'NZD', CURRENT_DATE + 10, CURRENT_DATE - 20, 0.96, 3, 30.0, true),
  ('PureGym',         'monthly', 39.00, 'NZD', CURRENT_DATE + 12, CURRENT_DATE - 18, 0.95, 3, 30.0, false),
  ('Rent Auckland',   'monthly', 1800,  'NZD', CURRENT_DATE +  5, CURRENT_DATE - 25, 0.99, 3, 30.0, true)
ON CONFLICT (payee_normalized, frequency) DO UPDATE SET
  amount_avg = EXCLUDED.amount_avg, next_expected = EXCLUDED.next_expected,
  last_seen = EXCLUDED.last_seen, confidence = EXCLUDED.confidence,
  sample_size = EXCLUDED.sample_size, avg_interval_days = EXCLUDED.avg_interval_days,
  confirmed = EXCLUDED.confirmed;

-- ─── SAVINGS GOALS ───
INSERT INTO fin_savings_goals (name, target_amount, current_amount, currency, target_date, category, notes) VALUES
  ('Emergency Fund',                15000,  8400, 'NZD', CURRENT_DATE + 365, 'safety',  '6 months expenses'),
  ('Travel — South America 2027',    8000,  2300, 'NZD', CURRENT_DATE + 540, 'travel',  '3 months trip Argentina+Chile+Peru'),
  ('House Deposit ES',              80000, 23500, 'EUR', CURRENT_DATE + 1825, 'housing', 'Madrid o Valencia, 20% piso 400k');

-- ─── INVESTMENTS (positions) ───
INSERT INTO fin_investments (symbol, quantity, avg_cost, currency, account, opened_at, notes) VALUES
  ('AAPL.US', 12,  142.50, 'USD', 'IBKR', CURRENT_DATE - 400, 'seed:demo'),
  ('VWRD.UK', 45,   95.20, 'USD', 'IBKR', CURRENT_DATE - 600, 'seed:demo'),
  ('IWDA.AS', 30,   78.10, 'EUR', 'DEGIRO', CURRENT_DATE - 500, 'seed:demo'),
  ('MSFT.US',  6,  310.00, 'USD', 'IBKR', CURRENT_DATE - 250, 'seed:demo');

-- ─── CRYPTO HOLDINGS ───
INSERT INTO fin_crypto_holdings (symbol, amount, exchange, notes) VALUES
  ('BTC', 0.18,    'Binance',     'seed:demo'),
  ('ETH', 2.40,    'Binance',     'seed:demo'),
  ('SOL', 35.0,    'Binance',     'seed:demo'),
  ('USDC', 1200.0, 'Ledger cold', 'seed:demo')
ON CONFLICT (symbol, exchange) DO UPDATE SET
  amount = EXCLUDED.amount, notes = EXCLUDED.notes;

-- ─── NW snapshots adicionales si faltan ───
INSERT INTO fin_net_worth_snapshots (date, total_nzd, breakdown) VALUES
  (CURRENT_DATE - 60, 78500, '{"cash":12000,"investments":48000,"crypto":18500}'::jsonb),
  (CURRENT_DATE - 30, 81200, '{"cash":13500,"investments":49200,"crypto":18500}'::jsonb),
  (CURRENT_DATE -  7, 83400, '{"cash":14800,"investments":50100,"crypto":18500}'::jsonb),
  (CURRENT_DATE,      84100, '{"cash":15200,"investments":50400,"crypto":18500}'::jsonb)
ON CONFLICT (date) DO UPDATE SET total_nzd = EXCLUDED.total_nzd, breakdown = EXCLUDED.breakdown;

COMMIT;

-- Verificar
SELECT 'finances' t, count(*), SUM(CASE WHEN type='income' THEN amount_nzd ELSE 0 END) AS in_, SUM(CASE WHEN type='expense' THEN amount_nzd ELSE 0 END) AS out_ FROM finances WHERE source='seed'
UNION ALL SELECT 'budgets', count(*), NULL, NULL FROM budgets
UNION ALL SELECT 'recurring', count(*), NULL, NULL FROM fin_recurring
UNION ALL SELECT 'savings_goals', count(*), NULL, NULL FROM fin_savings_goals
UNION ALL SELECT 'investments', count(*), NULL, NULL FROM fin_investments
UNION ALL SELECT 'crypto', count(*), NULL, NULL FROM fin_crypto_holdings
UNION ALL SELECT 'nw_snapshots', count(*), NULL, NULL FROM fin_net_worth_snapshots;
