# 📋 SIGNUPS.md — APIs / OAuth para activar stubs Tier A/D

**Generated:** 2026-04-07 (post Tier A round 2)
**Purpose:** Lista exhaustiva de servicios externos cuyo código stub ya existe en `/root/ultra-system/`. Solo necesitas crear cuenta, copiar credenciales, y pegarlas en `.env`. El cron las recogerá automáticamente.

**Cómo usar este documento:**
1. Lee la columna "Por qué" — decide si te interesa.
2. Click en "Signup URL" → crea cuenta (todas las marcadas FREE son gratis).
3. Copia la(s) credencial(es) al `.env` con el nombre indicado.
4. `docker compose restart engine` → próximo cron tick lo activa.

---

## 🟢 PRIORIDAD ALTA (free, alto valor, <5 min cada uno)

| Pillar | Servicio | Por qué | Signup URL | Variables `.env` |
|---|---|---|---|---|
| P1 | **Currents API** | 1k req/día, 70+ países, multilingual news | https://currentsapi.services/en/register | `CURRENTS_API_KEY` |
| P1 | **Newsdata.io** | 200 credits/día, 206 países, 89 idiomas | https://newsdata.io/register | `NEWSDATA_API_KEY` |
| P1 | **NewsAPI.ai (Event Registry)** | 2k búsquedas/mes, 150k sources, clusters de eventos | https://eventregistry.org/register | `EVENT_REGISTRY_API_KEY` |
| P1 | **YouTube Data API v3** | Search canales/videos por keywords (100 búsquedas/día gratis) | https://console.cloud.google.com/apis/library/youtube.googleapis.com | `YOUTUBE_API_KEY` |
| P1 | **Podcast Index** | 4M+ podcasts, ilimitado gratis | https://api.podcastindex.org/signup | `PODCAST_INDEX_KEY` + `PODCAST_INDEX_SECRET` |
| P1 | **ACLED conflict events** | Eventos de conflicto en DZ/MENA (alta relevancia para ti) | https://developer.acleddata.com/ | `ACLED_API_KEY` + `ACLED_EMAIL` |
| P2 | **USAJobs** | Federal jobs USA (visa-sponsor) | https://developer.usajobs.gov/APIRequest/Index | `USAJOBS_EMAIL` + `USAJOBS_API_KEY` |
| P2 | **Adzuna** | Jobs UK/AU/NZ/etc (1k req/mes free) | https://developer.adzuna.com/signup | `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` |
| P3 | **Wise multi-currency** | Cuenta multi-divisa, perfecto para nómada | https://wise.com/user/account-settings/security | `WISE_API_TOKEN` + `WISE_PROFILE_ID` |
| P3 | **Akahu** | NZ open banking (todas las cuentas NZ) | https://my.akahu.nz/developers/ | `AKAHU_APP_TOKEN` + `AKAHU_USER_TOKEN` |
| P6 | **Open Charge Map** | EV chargers globales (free) | https://openchargemap.org/site/develop/api | `OCM_API_KEY` |
| P7 | **USDA FoodData Central** | Nutrición US comprehensiva | https://fdc.nal.usda.gov/api-key-signup.html | `USDA_API_KEY` |
| P7 | **OpenUV** | UV index por lat/lon (50/día free) | https://www.openuv.io/auth/google | `OPENUV_API_KEY` |
| P7 | **Oura Ring** (si tienes anillo) | Sleep/HRV/readiness | https://cloud.ouraring.com/personal-access-tokens | `OURA_PERSONAL_TOKEN` |

---

## 🟡 PRIORIDAD MEDIA (free pero requieren OAuth o setup más largo)

| Pillar | Servicio | Por qué | Signup URL | Variables `.env` | Notas |
|---|---|---|---|---|---|
| P1 | **Finlight.me** | Financial/geopolitical 10k req/mes | https://finlight.me/signup | `FINLIGHT_API_KEY` | Foco financiero |
| P1 | **Mastodon API** | Search posts (rate limit superior con token) | https://mastodon.social/settings/applications | `MASTODON_ACCESS_TOKEN` | Sin token funciona pero rate-limited |
| P2 | **France Travail** | Empleos Francia (OAuth) | https://francetravail.io/data/api | `FRANCE_TRAVAIL_CLIENT_ID` + `_SECRET` | Free pero requiere aprobación |
| P2 | **Bundesagentur DE** | Empleos Alemania | https://jobsuche.api.bund.dev/ | `BUNDESAGENTUR_CLIENT_ID` | OAuth client_credentials |
| P3 | **Binance** | Crypto portfolio read-only | https://www.binance.com/en/my/settings/api-management | `BINANCE_API_KEY` + `BINANCE_API_SECRET` | **CRÍTICO**: solo Read-Only + IP whitelist |
| P5 | **Galxe** | Crypto quests (rewards crypto/NFT) | https://galxe.com/settings | `GALXE_API_KEY` | Necesita wallet conectada |
| P5 | **Layer3** | Crypto quests | https://layer3.xyz | `LAYER3_API_KEY` | Wallet-based |
| P5 | **Zealy** | Discord-based community quests | https://zealy.io | `ZEALY_API_KEY` + `ZEALY_SUBDOMAIN` | Por comunidad |
| P7 | **Fitbit** (si tienes pulsera) | Steps/HR/sleep | https://dev.fitbit.com/apps/new | `FITBIT_CLIENT_ID` + `_SECRET` | OAuth — callback: `/webhooks/wearable/fitbit/callback` |
| P7 | **Withings** (báscula/wearable) | Body composition + HR | https://developer.withings.com/dashboard/ | `WITHINGS_CLIENT_ID` + `_SECRET` | OAuth — callback: `/webhooks/wearable/withings/callback` |
| P7 | **CalorieNinjas** | NL parsing comida ("100g rice + chicken") | https://calorieninjas.com/register | `CALORIE_NINJAS_KEY` | Útil para Telegram bot food log |
| P6 | **Trustroots** (hospitality) | Red nómada con hosts free en 200+ países. Perfil van-life friendly. | https://www.trustroots.org/signup | `TRUSTROOTS_USERNAME` + `TRUSTROOTS_PASSWORD` | Sin API oficial — requiere session scraping via Puppeteer post-login |
| P6 | **BeWelcome** (hospitality) | Red hospitality libre-software (Couchsurfing alternative), 200K+ miembros | https://www.bewelcome.org/signup | `BEWELCOME_USERNAME` + `BEWELCOME_PASSWORD` | API REST v1 disponible pero account-bound |
| P6 | **WarmShowers** (cycling hospitality) | Red para cicloturistas — 120K+ hosts, ideal para tu segmento van/bici EU | https://www.warmshowers.org/signup | `WARMSHOWERS_API_KEY` | Free API key tras signup |

Notas hospitality (añadido 2026-04-08):
- Los 3 servicios son **gratis** pero requieren cuenta — por eso quedaron para el final del plan post-R4.
- Una vez loggeado, los 3 devuelven datos geo (lat/lon de hosts aceptando requests), perfecto para `logistics_pois` con `category='hospitality_host'`.
- **Privacy**: solo almacenar handles públicos + lat/lon, NUNCA contacts reales.
- Prioridad: **media** — alta para EU post-NZ, baja para NZ (donde el network es flojo).

---

## 🔴 PAID / B2B / GATED (defer hasta que sea necesario)

| Pillar | Servicio | Por qué pagar | URL |
|---|---|---|---|
| P1 | NewsAPI.org production | $449/mes — solo si Currents/Newsdata insuficiente | https://newsapi.org |
| P1 | Perigon News API | $99/mo — entity extraction propietario | https://www.goperigon.com |
| P3 | Plaid US/EU banking | Por uso — más amplio que Akahu | https://plaid.com |
| P6 | WiFi Map API | Paid — datos crowdsourced WiFi globales | https://www.wifimap.io/api |
| P6 | BlaBlaCar Public API | B2B approval — rideshare EU | https://www.blablacar.com/api |
| P6 | Booking.com Demand API | Case-by-case — affiliate revenue | https://developers.booking.com |

---

## 🟢 FLUJO RECOMENDADO PARA TI (priorizado por impacto)

### Sesión 1 — News (15 min total)
1. Currents API → 5 min, te da 1k req/día instantáneamente
2. Newsdata.io → 5 min, multilingual ES/FR/AR
3. Podcast Index → 5 min, 4M podcasts

### Sesión 2 — Money (30 min total)
4. Wise → genera token → `.env` → restart
5. Akahu → conecta cuenta NZ → user token → `.env`
6. Binance (si usas) → API Read-Only + IP whitelist → `.env`

### Sesión 3 — Bio (si tienes wearable) (10 min)
7. Oura: Personal Token directo, sin OAuth, instantáneo
8. Fitbit/Withings: requieren OAuth — visita `/webhooks/wearable/fitbit/auth` desde browser

### Sesión 4 — Nice-to-have (15 min)
9. ACLED → eventos de conflicto en MENA
10. YouTube Data → search canales por keyword
11. USDA + OpenUV + CalorieNinjas para P7 nutrición/UV
12. Open Charge Map → EV chargers (relevante para vanlife)

### Sesión 5 — Empleo (variable, depende interés)
13. USAJobs (5 min)
14. Adzuna (5 min)
15. France Travail (más complejo, requiere aprobación gov)

---

## 📦 Containers opcionales (activar con --profile)

```bash
# Apprise (multi-channel notifications: Discord/Slack/ntfy/Pushover/100+ servicios)
docker compose --profile notify up -d apprise
# Luego: APPRISE_URL=http://apprise:8000 en .env, restart engine

# n8n (workflow automation visual)
docker compose --profile automation up -d n8n
# Luego: visita http://localhost:5678 (user/password de .env: N8N_USER/N8N_PASSWORD)
```

---

## ⏱️ Total signups disponibles: ~30 servicios
- **Free instant:** ~14 (alta prioridad)
- **Free OAuth:** ~10 (prioridad media)
- **Paid/gated:** ~6 (defer)

Cuando tengas todas las credenciales pegadas, llamarás a estos crons automáticamente:
- `news-api-stubs` (cada 4h)
- `bio-extras-poll` (cada 6h)
- `logistics-extras` (jueves 04:30)
- `opp-fetch` (diario 06:00)
- `early-warning` (cada 30 min)
- `gov-jobs-fetch` (diario)

---

## Kill the Newsletter (newsletters → RSS, no signup needed)

Para cualquier newsletter por email que quieras consumir como RSS dentro de Ultra:

1. Abrir https://kill-the-newsletter.com en el navegador
2. Crear un inbox (te dará un email único + URL de feed Atom)
3. Suscribirte al newsletter usando el email único
4. Añadir la URL del feed Atom a Ultra:
   ```bash
   curl -X POST http://95.217.158.7/api/feeds \
     -H "X-API-Key: $API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"url":"https://kill-the-newsletter.com/feeds/XXX.xml","name":"Stratechery","category":"newsletter"}'
   ```
5. El cron `rss-fetch` (cada 30min) lo recogerá automáticamente.

**Newsletters recomendados** (técnicos/relevantes a tu perfil):
- Stratechery (Ben Thompson)
- Money Stuff (Matt Levine, Bloomberg)
- The Pragmatic Engineer (Gergely Orosz)
- Lenny's Newsletter
- Import AI (Jack Clark)
- Platformer (Casey Newton)

**Nota:** kill-the-newsletter.com es un servicio público gratuito de @leafac. Self-hosting opcional (defer — añade container Ruby/Node, +150MB).
