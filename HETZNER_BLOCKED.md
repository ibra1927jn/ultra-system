# 🛑 HETZNER_BLOCKED.md — Fuentes que requieren IP residencial

**Generated:** 2026-04-07 (Round 5)
**Purpose:** Inventario de fetchers que fallan por IP de datacenter (Hetzner CX43 95.217.158.7) y que **funcionarán automáticamente** al migrar el server al ordenador Windows residencial.

## Activación post-migración

Cuando migres a Windows, asegúrate de que el `.env` **NO** tenga `SKIP_HETZNER_BLOCKED=1`. Por defecto los fetchers ya intentan ejecutarse — el flag es opcional para skip-explícito en Hetzner.

```bash
# En Hetzner (datacenter): silencia los blocked
echo "SKIP_HETZNER_BLOCKED=1" >> .env

# En Windows residencial (post-migración): elimina la línea o:
sed -i '/SKIP_HETZNER_BLOCKED/d' .env
docker compose restart engine
```

Sin el flag, los fetchers ejecutan normalmente y aprovechan tu IP residencial.

## Fuentes bloqueadas (8 confirmadas)

| Pilar | Fuente | Síntoma Hetzner | Bypass mecanismo |
|---|---|---|---|
| P1 | **Reddit RSS** (`reddit.com/r/*/.rss`) | HTTP 403 desde datacenter | `SKIP_HETZNER_BLOCKED=1` skip; sin flag → fetch real |
| P1 | **ProMED-mail** (`promedmail.org/promed-posts/feed/`) | Cloudflare block | Same |
| P1 | **Smartraveller AU** (`smartraveller.gov.au/countries/rss.xml`) | Cloudflare block | Same |
| P1 | **ReliefWeb UN OCHA** (`reliefweb.int/disasters/rss.xml`) | HTTP 406 "bot activity" | Same |
| P1 | **Adam Isacson OPML** (LatAm 140+ feeds) | Cloudflare block | Pivoted → 16 feeds curados manualmente |
| P2 | **Glassdoor** (vía jobspy sidecar) | IP block, devuelve 0 jobs | Activar via jobspy site_name=glassdoor cuando residencial |
| P2 | **CrewBay / AllCruiseJobs / SeaJobs** (maritime) | 404/000/406 desde DC | Activar fetchers cuando residencial |
| P5 | **Solana Colosseum** (`arena.colosseum.org/api/hackathons`) | HTML wrapper (probable Cloudflare check) | **YA REEMPLAZADO** por Superteam Earn (R5) ✅ |
| P5 | **AceleraPyme ES** (`acelerapyme.gob.es/rss.xml`) | HTML antibot challenge desde container egress (host curl OK) | `SKIP_HETZNER_BLOCKED` |

## Patrones técnicos

1. **Cloudflare default rule "bot activity"** — bloquea AS de Hetzner/AWS/GCP automáticamente. Solución: residencial.
2. **Reddit anti-scraping** — devuelve 403 a UAs que no cambien IP+UA con frecuencia.
3. **Government sites con JS challenge** — algunos gov AU/EU usan challenge JS pre-RSS.

## Items NO recoverables ni con residencial

Estos quedan defer permanente — no son IP block sino formato/API:
- **Immunefi / Code4rena** — son SPAs Next.js, devuelven HTML wrapper. Necesitan Puppeteer/Playwright real (no IP issue).
- **DailyRemote / Nodesk / Huntr / F6S / Euraxess / SovereignTechFund** — SPAs sin RSS público.
- **GetOnBoard 401, Torre.ai 400, IssueHunt HTML** — endpoints requieren auth o devuelven HTML.
- **NAV Norway PAM feed** — feed deprecated por gov.no.
- **Job Bank Canada XML** — gov retiró el feed XML público.
- **17 Workday tenants R3** (Atlassian/Cisco/Adobe/etc) — necesitan `searchText`+facets per-tenant, no es IP issue.

## Reactivación una vez en Windows

```bash
# 1. Copia el repo + .env (sin SKIP_HETZNER_BLOCKED)
# 2. Verifica que las URLs responden:
for url in \
  "https://www.reddit.com/r/worldnews/.rss" \
  "https://promedmail.org/promed-posts/feed/" \
  "https://www.smartraveller.gov.au/countries/rss.xml" \
  "https://reliefweb.int/disasters/rss.xml"; do
  echo "$url -> $(curl -sIL --max-time 8 "$url" -A 'Mozilla/5.0' | head -1)"
done

# 3. Forzar fetch manual:
docker exec ultra_engine node -e "
  require('./src/news_apis').fetchRedditRSS().then(r => console.log('Reddit:', r));
  require('./src/early_warning').fetchProMED().then(r => console.log('ProMED:', r));
  require('./src/early_warning').fetchSmartraveller().then(r => console.log('Smart:', r));
  require('./src/early_warning').fetchReliefWeb().then(r => console.log('Relief:', r));
"
```

Si los 4 devuelven `inserted > 0`, las 8 fuentes están vivas y los crons las recogerán.

## Bonus: si Reddit sigue bloqueado en residencial

Reddit es agresivo incluso con residencial si haces requests muy seguidos. Mitigación:
- Subir `await new Promise(r => setTimeout(r, 1500))` entre subreddits → 5000ms.
- Rotar User-Agent realista (no `UltraSystem/1.0`).
- Usar `https://old.reddit.com/r/X/.rss` que es menos protegido.
- Alternativa: switch a Reddit API oficial (free, requiere OAuth client `REDDIT_CLIENT_ID` + `_SECRET`).
