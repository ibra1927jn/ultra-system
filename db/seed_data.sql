-- ╔══════════════════════════════════════════════════════════╗
-- ║  ULTRA SYSTEM — Seed Data para pilares vacios            ║
-- ║  Datos iniciales realistas para Allan en NZ              ║
-- ╚══════════════════════════════════════════════════════════╝

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P3: FINANZAS — Movimientos iniciales + budgets
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Budgets mensuales (NZD)
INSERT INTO budgets (category, monthly_limit) VALUES
  ('accommodation', 800),
  ('food', 400),
  ('transport', 200),
  ('subscriptions', 100),
  ('equipment', 150),
  ('entertainment', 50),
  ('health', 80),
  ('misc', 100)
ON CONFLICT (category) DO NOTHING;

-- Movimientos marzo 2026
INSERT INTO finances (type, amount, category, description, date) VALUES
  ('expense', 195.00, 'accommodation', 'Hostel Christchurch — semana 1', '2026-03-01'),
  ('expense', 195.00, 'accommodation', 'Hostel Christchurch — semana 2', '2026-03-08'),
  ('expense', 195.00, 'accommodation', 'Hostel Christchurch — semana 3', '2026-03-15'),
  ('expense', 195.00, 'accommodation', 'Hostel Christchurch — semana 4', '2026-03-22'),
  ('expense', 45.50, 'food', 'Pak n Save — compra semanal', '2026-03-02'),
  ('expense', 52.30, 'food', 'Pak n Save — compra semanal', '2026-03-09'),
  ('expense', 38.90, 'food', 'Countdown — compra semanal', '2026-03-16'),
  ('expense', 48.70, 'food', 'Pak n Save — compra semanal', '2026-03-23'),
  ('expense', 15.00, 'subscriptions', 'Claude Max', '2026-03-01'),
  ('expense', 12.99, 'subscriptions', 'GitHub Pro', '2026-03-01'),
  ('expense', 25.00, 'subscriptions', 'Hetzner VPS', '2026-03-01'),
  ('expense', 45.00, 'transport', 'Bus mensual Christchurch Metro', '2026-03-01'),
  ('expense', 22.00, 'health', 'Farmacia — vitaminas', '2026-03-05'),
  ('income', 850.00, 'freelance', 'Proyecto React dashboard — cliente UK', '2026-03-10'),
  ('income', 420.00, 'freelance', 'Script Python scraping — cliente AU', '2026-03-18')
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P5: OPORTUNIDADES — Proyectos iniciales
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO opportunities (title, source, url, category, status, notes, deadline) VALUES
  ('Build React + Supabase SaaS MVP', 'Freelancer.com', 'https://freelancer.com/projects/react-supabase-saas', 'web-dev', 'new', 'Score: 28 | $2000-5000 USD | React, TS, Supabase', '2026-04-15'),
  ('Python trading bot with CCXT', 'Upwork', 'https://upwork.com/jobs/python-trading-bot', 'python', 'contacted', 'Score: 22 | $1500 USD | Python, CCXT, FastAPI', '2026-04-10'),
  ('Three.js 3D product configurator', 'Freelancer.com', 'https://freelancer.com/projects/threejs-product-3d', '3d-graphics', 'new', 'Score: 25 | $3000 USD | Three.js, WebGL, React', '2026-04-20'),
  ('Mobile app PWA + Capacitor', 'Direct contact', 'https://harvestpro.nz', 'mobile', 'applied', 'HarvestPro NZ — Central Pac orchards', NULL),
  ('Automate warehouse inventory system', 'Seek NZ', 'https://seek.co.nz/job/warehouse-automation', 'automation', 'new', 'Score: 15 | On-site Christchurch', '2026-04-05')
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P6: LOGISTICA — Items viaje NZ
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO logistics (type, title, date, location, notes, status, cost) VALUES
  ('accommodation', 'Hostel Christchurch — renovar semana', '2026-03-29', 'Christchurch', 'Jailhouse Hostel, dorm 6-bed', 'confirmed', 195.00),
  ('accommodation', 'Buscar hostel Queenstown (abril)', '2026-04-05', 'Queenstown', 'Comparar: Nomads vs Base vs YHA', 'pending', 0),
  ('transport', 'InterCity bus Chch → Queenstown', '2026-04-05', 'Christchurch → Queenstown', 'Reservar con 2 semanas de anticipacion — descuento', 'pending', 45.00),
  ('visa', 'Working Holiday Visa — verificar fecha expiry', '2026-06-15', 'NZ Immigration', 'Visa expira Jun 2026 — planificar renovacion o siguiente destino', 'pending', 0),
  ('appointment', 'Reunion Central Pac — HarvestPro demo', '2026-04-02', 'Christchurch / Video call', 'Preparar: demo PWA, pricing, timeline', 'pending', 0)
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P7: BIO-CHECK — Registros de la semana
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO bio_checks (date, sleep_hours, energy_level, mood, exercise_minutes, notes) VALUES
  ('2026-03-23', 7.0, 7, 7, 30, 'Caminata por Hagley Park'),
  ('2026-03-24', 6.5, 6, 6, 0, 'Sesion larga de codigo, poco movimiento'),
  ('2026-03-25', 7.5, 8, 8, 45, 'Gym + buen progreso en alze engine'),
  ('2026-03-26', 5.5, 5, 5, 15, 'Dormi mal, hostel ruidoso'),
  ('2026-03-27', 6.0, 6, 6, 0, 'Dia de debug intenso'),
  ('2026-03-28', 8.0, 9, 9, 60, 'Sesion masiva productiva, 200+ archivos. Caminata larga'),
  ('2026-03-29', 7.0, 7, 7, 20, 'Hoy: bloque herramientas + commits')
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P4: BUROCRACIA — Documentos con expiry
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO document_alerts (document_name, document_type, expiry_date, alert_days, notes) VALUES
  ('Working Holiday Visa NZ', 'visa', '2026-06-15', 90, 'Visa de trabajo temporal — planificar siguiente paso'),
  ('Passport España', 'passport', '2028-11-20', 180, 'Pasaporte español — renovar 6 meses antes de expirar'),
  ('Travel Insurance', 'insurance', '2026-06-15', 30, 'Seguro viaje Southern Cross — revisar cobertura'),
  ('IRD Number NZ', 'tax', '2099-12-31', 365, 'Numero fiscal NZ — no expira pero mantener registro')
ON CONFLICT DO NOTHING;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  P1: NOTICIAS — RSS feeds iniciales + keywords
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

INSERT INTO rss_keywords (keyword, weight) VALUES
  ('new zealand', 8),
  ('immigration', 9),
  ('working holiday', 10),
  ('christchurch', 7),
  ('cryptocurrency', 6),
  ('bitcoin', 5),
  ('react', 6),
  ('typescript', 6),
  ('ai agent', 8),
  ('claude', 7),
  ('supabase', 8),
  ('agriculture', 7),
  ('orchard', 9),
  ('horticulture', 8),
  ('minimum wage', 7)
ON CONFLICT (keyword) DO NOTHING;
