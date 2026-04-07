# 🎭 PLAYWRIGHT_SIDECAR.md — Plan para SPAs irrecuperables

**Generated:** 2026-04-07 (R6)
**Status:** Plan documentado, no implementado. Activar bajo demanda.

## Por qué un sidecar Playwright

Tras Round 6 (Torre.ai + GetOnBoard recovery), los siguientes 6-8 sources NO tienen API JSON pública y están construidos como SPAs Next.js / React puros con state cliente. Para cada uno, los probes muestran HTML wrapper sin `__NEXT_DATA__` ni endpoints API alternativos:

| Source | Pilar | Tipo | Razón |
|---|---|---|---|
| **Immunefi** | P5 | SPA Next.js | Bug bounty programs render client-side |
| **Code4rena** | P5 | SPA Next.js | Audit contests render client-side |
| **Huntr.dev** | P5 | SPA Next.js | OSS bounties render client-side |
| **F6S** | P5 | SPA + Cloudflare challenge | Anti-bot JS challenge |
| **NAV Norway** | P2 | SPA Next.js | Reemplazo del feed retirado, full client-side |
| **Job Bank Canada** | P2 | SPA | Reemplazo del XML retirado, full client-side |
| **DailyRemote** | P5 | SPA | Sin API pública |
| **Nodesk** | P5 | SPA / newsletter | Sin API pública |
| **Sovereign Tech Fund** | P5 | SPA | Sin API pública |
| **JPMorgan Workday** | P2 | Cloudflare anti-bot | wday endpoint exists, requires JS-generated CSRF |
| **Goldman Sachs Workday** | P2 | Cloudflare anti-bot | Same |
| **Deloitte/EY/KPMG/McKinsey** | P2 | SAP SuccessFactors o custom | No usan Workday/Greenhouse/Lever/Smartrec |

**Common pattern**: server returns shell HTML, JS hydrates from internal API endpoints that require browser cookies/tokens generated client-side. Curl no funciona; sólo un browser headless real puede ejecutar el JS y extraer datos.

## Coste-beneficio

**Coste**:
- Container Playwright (~400MB image, ~500MB RAM idle, 1GB RAM peak)
- Tu CX43 tiene 16GB RAM, ~13GB libres → **cabe sin problema**
- Disco: ~600MB con browsers Chromium+Firefox precargados
- Latencia: 5-15s por scrape (vs 0.5s API JSON)

**Beneficio**:
- ~9 fuentes recuperadas (incluyendo Immunefi/Code4rena que son **alta calidad** para crypto bounties)
- Cobertura total tier A: de ~70% → ~90%

## Plan de implementación (cuando lo decidas)

### 1. Container `playwright_scraper` en docker-compose.yml

```yaml
playwright:
  image: mcr.microsoft.com/playwright:v1.49.0-noble
  container_name: ultra_playwright
  restart: unless-stopped
  command: node /app/server.js
  ports:
    - "8009:3000"
  volumes:
    - ./playwright/:/app/:ro
  mem_limit: 1g
  networks:
    - ultra_net
```

### 2. `playwright/server.js` — REST wrapper

```javascript
const { chromium } = require('playwright');
const express = require('express');
const app = express();
app.use(express.json());

let browser;
(async () => { browser = await chromium.launch({ headless: true }); })();

app.post('/scrape', async (req, res) => {
  const { url, waitFor, extract } = req.body;
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 ...' });
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 });
    const data = extract
      ? await page.$$eval(extract.selector, (els, attrs) => els.map(el => Object.fromEntries(attrs.map(a => [a, el[a] || el.getAttribute(a)]))), extract.attrs || ['textContent', 'href'])
      : await page.content();
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  } finally {
    await ctx.close();
  }
});

app.listen(3000);
```

### 3. `src/playwright_client.js` — wrapper

```javascript
const BASE = process.env.PLAYWRIGHT_URL || 'http://playwright:3000';

async function scrapePage({ url, waitFor, selector, attrs }) {
  const r = await fetch(`${BASE}/scrape`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, waitFor, extract: { selector, attrs } }),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Playwright HTTP ${r.status}`);
  return r.json();
}

module.exports = { scrapePage };
```

### 4. Refactor de fetchers existentes

Por ejemplo, `fetchImmunefi()`:
```javascript
async function fetchImmunefi() {
  if (!process.env.PLAYWRIGHT_URL) return { source: 'immunefi', skipped: 'Playwright sidecar no activo' };
  const pw = require('./playwright_client');
  const r = await pw.scrapePage({
    url: 'https://immunefi.com/explore/',
    waitFor: 'a[href^="/bug-bounty/"]',
    selector: 'a[href^="/bug-bounty/"]',
    attrs: ['href', 'textContent']
  });
  // ... map r.data.data → opportunities
}
```

## Activación rápida (cuando estés listo)

```bash
# 1. Crea directorio
mkdir -p playwright

# 2. Crea playwright/server.js (copia el de arriba)
# 3. Crea playwright/package.json: {"dependencies":{"playwright":"^1.49.0","express":"^4.21.0"}}

# 4. Añade el bloque a docker-compose.yml

# 5. Levanta el container
docker compose up -d playwright

# 6. Set env en .env
echo "PLAYWRIGHT_URL=http://playwright:3000" >> .env
docker compose restart engine
```

A partir de ese momento, los 9 fetchers Playwright-gated ejecutan en sus crons normales.

## Alternativa más ligera: ScrapingBee / Browserless cloud

Si no quieres mantener el container:
- **Browserless.io** — managed Playwright cloud, $50/mes 1000 requests/día
- **ScrapingBee** — $50/mes para 100K API calls
- **ScraperAPI** — $49/mes con 100K credits

Activable via env var `SCRAPING_API_URL` + cambio mínimo en `playwright_client.js`.

## Items que NO se recuperan ni con Playwright

| Source | Razón estructural |
|---|---|
| GetOnBoard `/jobs` (full) | OAuth real registration; categorías ya cubiertas free |
| Algora console | trpc batch undocumented, frecuentes breaking changes |
| Stripe/Twilio en Workday | NO usan Workday, ya cubiertos por Greenhouse fetcher |
| McKinsey/Deloitte/EY/KPMG/JPM/GS Workday | usan SAP SuccessFactors o custom — necesita fetchers per-empresa custom |

**Conclusión**: con Playwright sidecar pasarías de "0 recuperables" a "9 recuperables". Tras eso, ~5 items quedan defer permanente por razones estructurales (auth real, breaking APIs, ATS custom).
