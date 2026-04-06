# Employment Pillar Architecture Design — Ultra System v2

> Documento de diseno generado 2026-04-06 | Branch: v2-rebuild
> Basado en investigacion de JobSpy, JobFunnel, 25 portales, 8 APIs, y analisis de scrapers existentes
> Perfil: warehouse/logistics (Amazon L2) + full-stack dev + trilingue ES/EN/AR + open work visa NZ
> Paises target: NZ, AU, ES, Mundo (remote)

---

## 1. Fuentes de Datos por Pais

### Resumen de Portales Investigados (25 total)

| # | Portal | Pais | API | RSS | Cheerio | Playwright | Mejor Enfoque |
|---|--------|------|-----|-----|---------|------------|---------------|
| 1 | SEEK NZ | NZ | Partner-only | No | Bloqueado | Medio-Dificil | Adzuna proxy |
| 2 | Trade Me Jobs | NZ | **SI (gratis)** | No | N/A | N/A | **API OAuth** |
| 3 | Indeed NZ | NZ | Deprecada | No | Bloqueado | Dificil | JobSpy/Adzuna |
| 4 | MSD Find a Job | NZ | No | No | Posible (SSR) | Facil | Cheerio |
| 5 | Jora NZ | NZ | No | No | Medio | Facil | Cheerio+stealth |
| 6 | BackpackerBoard | NZ | No | No | Bloqueado | Medio | Baja prioridad |
| 7 | PickNZ | NZ | No | Quizas | **Facil** | No necesita | **Cheerio** |
| 8 | MyJobSpace NZ | NZ | No | No | **Facil** | No necesita | **Cheerio** |
| 9 | SEEK AU | AU | Partner-only | No | Bloqueado | Medio-Dificil | Adzuna proxy |
| 10 | Indeed AU | AU | Deprecada | No | Bloqueado | Dificil | JobSpy/Adzuna |
| 11 | Jora AU | AU | No | No | Medio | Facil | Cheerio+stealth |
| 12 | CareerOne AU | AU | No | No | Bloqueado | Medio | Playwright |
| 13 | InfoJobs | ES | **SI (gratis)** | No | N/A | N/A | **API REST** |
| 14 | Indeed ES | ES | Deprecada | No | Bloqueado | Dificil | JobSpy/Adzuna |
| 15 | LinkedIn ES | ES | No | No | Bloqueado | Bloqueado | Evitar |
| 16 | SEPE | ES | No | No | Medio | Medio | Cheerio |
| 17 | Tecnoempleo | ES | No | No | **Facil** | No necesita | **Cheerio** |
| 18 | LinkedIn | Global | No | No | Bloqueado | Bloqueado | JobSpy (limitado) |
| 19 | We Work Remotely | Remote | No | **SI** | N/A | N/A | **RSS** |
| 20 | Remote OK | Remote | **SI (gratis)** | SI | N/A | N/A | **API JSON** |
| 21 | Wellfound | Remote | No | No | Dificil | Medio | Baja prioridad |
| 22 | Freelancer.com | Remote | SI (OAuth) | No | N/A | N/A | API (ya integrado) |
| 23 | Upwork | Remote | Restringida | Deprecado | Dificil | Medio | API limitada |
| 24 | Himalayas | Remote | **SI (gratis)** | No | N/A | N/A | **API JSON** |
| 25 | FlexJobs | Remote | No | No | Dificil | Dificil | Skip (de pago) |

### APIs Adicionales Descubiertas

| API | Gratis | Paises | Auth | Rate Limit | NZ Relevancia |
|-----|--------|--------|------|------------|---------------|
| **Adzuna** | SI | NZ, AU, ES, UK, +10 | API key | 1000/hr (ampliable) | **ALTA** — ya integrada, agrega SEEK+Indeed |
| **Careerjet** | SI | 90+ sitios, 28 idiomas | API key | 1000/hr | **ALTA** — locale `en_NZ`, agrega varias fuentes |
| **Jooble** | SI | 69 paises | API key | Generoso | **ALTA** — tiene jooble.co.nz |
| **Remotive** | SI | Global (remote) | Ninguna | 2 req/min | MEDIA — remote jobs, 24h delay |
| **Arbeitnow** | SI | Europa + remote | Ninguna | No documentado | MEDIA — tiene filtro `visa_sponsorship=true` |

### Estrategia por Pais

**Nueva Zelanda (prioridad maxima):**
- Tier 1: Adzuna API (ya funciona, agrega SEEK + Indeed)
- Tier 1: Trade Me API (la mejor fuente NZ, gratis con OAuth)
- Tier 2: Careerjet API (locale NZ, agrega fuentes extra)
- Tier 2: Jooble API (cross-referencia)
- Tier 3: MyJobSpace (Cheerio), PickNZ (Cheerio), MSD Find a Job (Cheerio/Playwright)
- JobSpy: Indeed NZ + LinkedIn NZ como complemento

**Australia:**
- Tier 1: Adzuna API (agrega SEEK AU + Indeed AU)
- Tier 2: Careerjet API (locale AU)
- Tier 2: Jooble API
- Tier 3: Jora AU (Cheerio+stealth)
- JobSpy: Indeed AU + LinkedIn AU

**Espana:**
- Tier 1: InfoJobs API (mayor portal espanol, gratis)
- Tier 2: Adzuna API (cubre ES)
- Tier 2: Tecnoempleo (Cheerio, tech jobs)
- Tier 3: SEPE (empleo publico)
- JobSpy: Indeed ES + LinkedIn ES

**Remote/Mundo:**
- Tier 1: Remote OK API (JSON gratis, sin auth)
- Tier 1: Himalayas API (98k+ jobs, sin auth)
- Tier 1: We Work Remotely RSS (por categoria)
- Tier 2: Remotive API (24h delay)
- Tier 2: Arbeitnow API (visa_sponsorship filter)
- Tier 3: Freelancer.com API (ya integrado para oportunidades)
- JobSpy: LinkedIn (con proxies, limitado)

---

## 2. Herramientas: JobSpy vs Scraper Propio vs Ambos

### JobSpy (python-jobspy v1.1.82)

**Portales soportados (8):** Indeed (60+ paises), LinkedIn, Glassdoor, Google Jobs, ZipRecruiter, Bayt, Naukri, BDJobs

**Probado exitosamente con:**
- `country_indeed='new zealand'` — devuelve jobs de nz.indeed.com
- `country_indeed='australia'` — devuelve jobs de au.indeed.com
- `country_indeed='spain'` — devuelve jobs de es.indeed.com
- `is_remote=True` — filtra remote en LinkedIn e Indeed

**Campos por job:** id, title, company_name, company_url, job_url, location (city/state/country), description (texto completo), job_type, compensation (min/max/currency), date_posted, is_remote, emails

**Anti-bot:**
- Indeed: GraphQL API, sin rate limiting, el mas fiable
- LinkedIn: HTML scraping, rate limit en pagina ~10, requiere proxies para volumen
- Glassdoor: GraphQL con token fallback
- ZipRecruiter: TLS fingerprinting + 5s delays (solo US/CA)

**Extensibilidad:** Arquitectura modular. Cada scraper extiende `Scraper` base class. Agregar SEEK/Trade Me/InfoJobs es posible creando un modulo nuevo + registrandolo en `SCRAPER_MAPPING`.

**Integracion con Node.js (3 opciones):**
1. **jobspy-js (Borgius)** — Port TypeScript completo. Soporta 9 boards. Incluye TLS fingerprinting, dedup, CLI, MCP server. La opcion mas madura para Node.js.
2. **ts-jobspy (alpharomercoma)** — Port parcial, solo LinkedIn + Indeed. 417 descargas/semana.
3. **Python microservice** — Correr python-jobspy via child_process o HTTP wrapper. Mas fiable pero requiere Python instalado.

**Decision:** Usar **jobspy-js** como scraper principal para Indeed/LinkedIn/Glassdoor. Complementar con APIs directas (Adzuna, Trade Me, InfoJobs, etc.) desde Node.js.

### Scraper Existente en Ultra System

**scraper.js (P2: Empleo):**
- 2 modos: Cheerio HTML scraping + Adzuna API
- Cheerio: generico con `css_selector` por fuente. Funcional pero fragil (selectores se rompen)
- Adzuna: 7 queries predefinidas para NZ (warehouse, tech, hospitality, logistics, construction)
- Hardcoded a NZ. No soporta AU/ES/Remote
- Dedup por URL, notifica via Telegram
- **Estado:** Funcional para NZ via Adzuna. Cheerio sources probablemente rotas (selectores desactualizados)

**freelance_scraper.js (P5: Oportunidades):**
- Scraping de Freelancer.com con Cheerio
- 6 queries (react, python, supabase, mobile, 3d, automation)
- Scoring basado en keywords del perfil (SKILL_KEYWORDS)
- Guarda en tabla `opportunities`, no `job_listings`
- **Estado:** Probablemente roto (Freelancer cambia selectores frecuentemente)

**Utils existentes reutilizables:**
- `adzuna_params.js` — builder de URLs Adzuna (NZ hardcoded)
- `salary_format.js` — formateo de salarios
- `freelance_scoring.js` — scoring por keywords (base para job scoring)

### Decision: Arquitectura Hibrida

```
FASE 1 (Node.js nativo):
  APIs directas: Adzuna, Trade Me, InfoJobs, Remote OK, Himalayas, Careerjet, Jooble, WWR RSS
  Cheerio: Tecnoempleo, PickNZ, MyJobSpace, MSD

FASE 2 (agregar jobspy-js o Python service):
  JobSpy: Indeed (NZ/AU/ES), LinkedIn, Glassdoor
  Custom scrapers: SEEK (si Adzuna no es suficiente)
```

---

## 3. Flujo de Datos

```
                         FUENTES POR TIPO
          ┌────────────────┬──────────────────┬──────────────┐
          │                │                  │              │
     APIs (Node.js)    Scrapers (Cheerio)  JobSpy (F2)   RSS
     ├─ Adzuna NZ/AU/ES  ├─ Tecnoempleo    ├─ Indeed     ├─ WWR
     ├─ Trade Me API      ├─ PickNZ         ├─ LinkedIn   └─ (otros)
     ├─ InfoJobs API      ├─ MyJobSpace     ├─ Glassdoor
     ├─ Remote OK API     ├─ MSD NZ         └─ Google Jobs
     ├─ Himalayas API     └─ SEPE
     ├─ Careerjet API
     ├─ Jooble API
     ├─ Remotive API
     └─ Arbeitnow API
          │                │                  │              │
          └────────┬───────┴──────────────────┴──────┬───────┘
                   │                                 │
          ┌────────▼─────────────────────────────────▼────────┐
          │              NORMALIZATION LAYER                   │
          │                                                    │
          │  1. Map campos de cada fuente a schema unificado   │
          │  2. Detectar pais/region si no viene               │
          │  3. Parsear salario a rango numerico                │
          │  4. Limpiar HTML de descriptions                    │
          └──────────────────────┬─────────────────────────────┘
                                 │
          ┌──────────────────────▼─────────────────────────────┐
          │              PROCESSING LAYER                       │
          │                                                     │
          │  1. Dedup: URL exacta + titulo+empresa Jaccard      │
          │  2. Scoring: match + speed + difficulty + total      │
          │  3. Categorizar: sector (warehouse, tech, etc.)      │
          │  4. Enriquecer: salario estimado si falta             │
          └──────────────────────┬─────────────────────────────┘
                                 │
          ┌──────────────────────▼─────────────────────────────┐
          │              STORAGE (PostgreSQL)                    │
          │                                                     │
          │  emp_profile     — perfil del usuario               │
          │  emp_portals     — fuentes configuradas             │
          │  emp_listings    — ofertas normalizadas             │
          │  emp_applications — tracking de postulaciones       │
          └──────────────────────┬─────────────────────────────┘
                                 │
          ┌──────────────────────▼─────────────────────────────┐
          │              API LAYER (Express.js)                  │
          │                                                     │
          │  GET /api/v2/jobs                                    │
          │  GET /api/v2/jobs/:id                                │
          │  GET /api/v2/jobs/stats                              │
          │  PATCH /api/v2/jobs/:id/status                       │
          │  GET /api/v2/jobs/portals                             │
          └──────────────────────┬─────────────────────────────┘
                                 │
          ┌──────────────────────▼─────────────────────────────┐
          │              FRONTEND                                │
          │                                                     │
          │  Mundo → NZ / AU / ES / Remote                      │
          │  Filtros: sector, salario, score, status             │
          │  Cards con scoring visual                            │
          └─────────────────────────────────────────────────────┘
```

---

## 4. Scoring de Ofertas

### 4.1 score_match — Compatibilidad con Perfil (0-100)

Formula compuesta con 5 factores:

```
score_match = (
    skills_score     * 0.40 +    // skills que matchean
    experience_score * 0.25 +    // nivel de experiencia compatible
    language_score   * 0.15 +    // idiomas requeridos que tienes
    location_score   * 0.10 +    // ubicacion/visa compatible
    sector_score     * 0.10      // sector donde tienes experiencia
)
```

**skills_score (0-100):**
```javascript
const PROFILE_SKILLS = {
  // Warehouse/Logistics (Amazon L2)
  'warehouse': 10, 'logistics': 10, 'forklift': 9, 'packing': 8,
  'team leader': 10, 'supervisor': 9, 'amazon': 10, 'inventory': 8,
  'picking': 8, 'dispatch': 7, 'supply chain': 8, 'wms': 7,
  'health and safety': 7, 'shift leader': 9,
  
  // Full-stack Dev
  'react': 10, 'typescript': 10, 'node': 10, 'python': 9,
  'postgresql': 9, 'docker': 8, 'fastapi': 9, 'express': 8,
  'supabase': 9, 'firebase': 7, 'three.js': 8, 'c++': 7,
  'javascript': 8, 'html': 6, 'css': 6, 'git': 7,
  'api': 7, 'rest': 7, 'graphql': 6, 'aws': 6,
  
  // General
  'bilingual': 8, 'trilingual': 10, 'spanish': 8, 'arabic': 7,
  'full stack': 10, 'fullstack': 10, 'developer': 8, 'engineer': 7,
};

// score = sum(matched_weights) / sum(top_5_weights) * 100, cap 100
```

**experience_score (0-100):**
```javascript
function experienceScore(requiredYears) {
  // Perfil: ~3 anos warehouse, ~2 anos dev
  const warehouse_years = 3;
  const dev_years = 2;
  const relevant_years = Math.max(warehouse_years, dev_years); // usar el mayor
  
  if (!requiredYears || requiredYears <= 0) return 80; // no especificado
  if (requiredYears <= relevant_years) return 100;      // cumple
  if (requiredYears <= relevant_years + 1) return 70;   // casi
  if (requiredYears <= relevant_years + 2) return 40;   // stretch
  return 15;                                             // muy por encima
}
```

**language_score (0-100):**
```javascript
function languageScore(jobText) {
  const text = jobText.toLowerCase();
  let score = 50; // base (ingles asumido)
  
  if (text.match(/spanish|espanol|castellano/)) score += 25;
  if (text.match(/arabic|arabe/)) score += 25;
  if (text.match(/bilingual|trilingual|multilingual/)) score += 20;
  if (text.match(/english.*(spanish|arabic)|spanish.*(english|arabic)/)) score += 15;
  
  return Math.min(score, 100);
}
```

**location_score (0-100):**
```javascript
function locationScore(job) {
  if (job.is_remote) return 95;
  if (job.country === 'NZ') return 100; // ya estas ahi
  if (job.country === 'AU') return 80;  // cerca, Working Holiday posible
  if (job.country === 'ES') return 75;  // ciudadania EU pendiente?
  if (job.visa_sponsorship) return 70;  // cualquier pais con sponsor
  return 30; // otro pais sin sponsor
}
```

**sector_score (0-100):**
```javascript
const SECTOR_EXPERIENCE = {
  'warehouse': 100, 'logistics': 100, 'supply-chain': 90,
  'tech': 90, 'software': 90, 'web-dev': 85,
  'hospitality': 50, 'construction': 40, 'retail': 45,
  'agriculture': 60, // seasonal work NZ
};
```

### 4.2 score_speed — Velocidad de Contratacion (0-100)

```javascript
function speedScore(job) {
  let score = 30; // base
  const text = (job.title + ' ' + job.description).toLowerCase();
  
  // Urgencia en texto
  if (text.match(/immediate start|start immediately/)) score += 30;
  if (text.match(/asap|as soon as possible/)) score += 25;
  if (text.match(/urgent|urgently/)) score += 25;
  if (text.match(/start date.*within (1|2) week/)) score += 20;
  if (text.match(/walk.in|same.day interview/)) score += 30;
  if (text.match(/temp|casual|seasonal/)) score += 15;
  if (text.match(/ongoing|permanent/)) score -= 5; // proceso mas largo
  
  // Recencia del posting
  const daysOld = daysSincePosted(job.date_posted);
  if (daysOld <= 1) score += 20;
  else if (daysOld <= 3) score += 15;
  else if (daysOld <= 7) score += 10;
  else if (daysOld <= 14) score += 5;
  // > 14 dias: no bonus
  
  // Metodo de aplicacion
  if (text.match(/easy apply|quick apply|apply now/)) score += 10;
  if (job.emails && job.emails.length > 0) score += 10; // email directo
  
  return Math.min(Math.max(score, 0), 100);
}
```

### 4.3 score_difficulty — Dificultad de Entrada (0-100, mayor = mas dificil)

```javascript
function difficultyScore(job) {
  let score = 50; // base medio
  const text = (job.title + ' ' + job.description).toLowerCase();
  
  // Experiencia requerida
  const yearsMatch = text.match(/(\d+)\+?\s*years?\s*(of\s*)?(experience|exp)/);
  if (yearsMatch) {
    const years = parseInt(yearsMatch[1]);
    if (years <= 1) score -= 15;
    else if (years <= 3) score += 0;
    else if (years <= 5) score += 15;
    else score += 30;
  }
  
  // Senales de accesibilidad (reducen dificultad)
  if (text.match(/no experience|entry.level/)) score -= 20;
  if (text.match(/training provided|will train/)) score -= 15;
  if (text.match(/open to graduates|graduate/)) score -= 10;
  if (text.match(/all backgrounds|diverse/)) score -= 5;
  
  // Senales de alta barrera (aumentan dificultad)
  if (text.match(/senior|lead|principal|architect/)) score += 20;
  if (text.match(/degree required|bachelor|master/)) score += 15;
  if (text.match(/certification|certified|license required/)) score += 10;
  if (text.match(/security clearance|background check/)) score += 10;
  if (text.match(/nz citizen|resident only|no visa/)) score += 25; // deal-breaker para visa holders
  if (text.match(/visa sponsor/)) score -= 10; // mas accesible
  
  return Math.min(Math.max(score, 0), 100);
}
```

### 4.4 score_total — Combinacion Ponderada

```javascript
function totalScore(match, speed, difficulty) {
  // Invertir difficulty (100 = dificil = malo para nosotros)
  const ease = 100 - difficulty;
  
  return Math.round(
    match  * 0.50 +    // compatibilidad es lo mas importante
    speed  * 0.25 +    // rapidez de contratacion importa (visa temporal)
    ease   * 0.25      // facilidad de entrada
  );
}

// Ejemplo:
// match=85, speed=70, difficulty=30 → total = 85*0.5 + 70*0.25 + 70*0.25 = 77.5
// match=60, speed=90, difficulty=70 → total = 60*0.5 + 90*0.25 + 30*0.25 = 60.0
```

### Colores de Score

| Score | Color | Label |
|-------|-------|-------|
| 80-100 | Verde | Excelente match |
| 60-79 | Amarillo | Buen match |
| 40-59 | Gris | Regular |
| 0-39 | Rojo tenue | Bajo match |

---

## 5. Deduplicacion

### Estrategia de 3 capas

**Capa 1 — URL exacta:**
```sql
INSERT INTO emp_listings (...) ON CONFLICT (url) DO NOTHING;
```
Atrapa ~60% de duplicados. Misma oferta en Adzuna y Careerjet tendra URLs diferentes pero apuntaran al mismo portal original.

**Capa 2 — URL normalizada del destino:**
```javascript
// Muchas APIs dan redirect URLs (adzuna.com/redirect/...)
// Normalizar a la URL final del portal original
function normalizeJobUrl(url) {
  // Quitar tracking params
  const u = new URL(url);
  u.searchParams.delete('utm_source');
  u.searchParams.delete('utm_medium');
  u.searchParams.delete('utm_campaign');
  u.searchParams.delete('ref');
  u.searchParams.delete('from');
  return u.toString();
}
```

**Capa 3 — Composite key (titulo + empresa + ciudad):**
```javascript
function isDuplicateJob(newJob, existingJobs) {
  const normalize = t => t.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const key = (j) => `${normalize(j.title)}|${normalize(j.company || '')}|${normalize(j.city || '')}`;
  const newKey = key(newJob);
  
  for (const existing of existingJobs) {
    // Exact composite match
    if (key(existing) === newKey) return existing.id;
    
    // Fuzzy title match (misma empresa, titulo similar)
    if (normalize(existing.company) === normalize(newJob.company) && existing.company) {
      const titleWords = new Set(normalize(newJob.title).split(' ').filter(w => w.length >= 4));
      const existingWords = new Set(normalize(existing.title).split(' ').filter(w => w.length >= 4));
      const intersection = [...titleWords].filter(w => existingWords.has(w));
      const similarity = intersection.length / Math.min(titleWords.size, existingWords.size);
      if (similarity > 0.7) return existing.id;
    }
  }
  return null; // no duplicate
}
```

**Cuando se detecta duplicado:** No eliminar, vincular. El primer listing es "principal" y los demas apuntan a el:
```sql
ALTER TABLE emp_listings ADD COLUMN duplicate_of INTEGER REFERENCES emp_listings(id);
```
Esto permite ver "encontrada en 3 portales" (cross-validation).

---

## 6. Frecuencia de Scraping

| Fuente | Intervalo | Razon |
|--------|-----------|-------|
| Adzuna API | 4 horas | Rate limit generoso, 7 queries NZ + 3 AU + 2 ES |
| Trade Me API | 6 horas | Respetar OAuth terms, NZ solo |
| InfoJobs API | 6 horas | Respetar API terms, ES solo |
| Remote OK API | 6 horas | No auth, pero cortesia |
| Himalayas API | 8 horas | No auth, bajo volumen |
| Careerjet API | 8 horas | 1000 req/hr limit |
| Jooble API | 8 horas | Free tier |
| WWR RSS | 1 hora | RSS TTL=60 minutos |
| Remotive API | 12 horas | Max 4 fetches/dia recomendado |
| Arbeitnow API | 12 horas | Complemento |
| Cheerio scrapers | 12 horas | Respetar sitios pequenos |
| JobSpy (Fase 2) | 12 horas | Rate limits LinkedIn, Indeed anti-bot |

**Implementacion:**
```javascript
// scheduler.js
cron.schedule('0 */4 * * *', () => fetchAdzunaAll());       // Adzuna cada 4h
cron.schedule('0 */6 * * *', () => fetchTradeMe());          // Trade Me cada 6h
cron.schedule('0 */6 * * *', () => fetchInfoJobs());         // InfoJobs cada 6h
cron.schedule('30 */6 * * *', () => fetchRemoteAPIs());      // Remote OK + Himalayas
cron.schedule('0 */8 * * *', () => fetchAggregatorAPIs());   // Careerjet + Jooble
cron.schedule('0 * * * *', () => fetchWWR());                // WWR RSS cada hora
cron.schedule('0 */12 * * *', () => fetchCheerioSources());  // Cheerio cada 12h
cron.schedule('0 */12 * * *', () => fetchRemotiveArbeitnow()); // Complementos
```

---

## 7. Estructura de la API

### Endpoints

```
GET /api/v2/jobs
  ?country=NZ|AU|ES|remote|all
  ?region=Christchurch|Auckland|Melbourne|Madrid|...
  ?sector=warehouse|tech|hospitality|construction|agriculture|...
  ?type=fulltime|parttime|contract|casual|temp|internship
  ?min_score=0-100
  ?min_salary=30000
  ?max_salary=100000
  ?search=keyword
  ?source=adzuna|trademe|infojobs|remoteok|...
  ?status=new|saved|applied|interview|rejected|hidden
  ?days=7 (default, max 60)
  ?sort=score|date|salary (default: score)
  ?limit=20 (default, max 100)
  ?offset=0
  Response: { listings: [...], total: N, filters: {...} }

GET /api/v2/jobs/:id
  Response: { listing: {...}, similar: [...], duplicates: [...], cross_pillar: {...} }

GET /api/v2/jobs/stats
  ?days=30
  Response: {
    total: N,
    by_country: { NZ: N, AU: N, ES: N, remote: N },
    by_sector: { warehouse: N, tech: N, ... },
    by_score_range: { excellent: N, good: N, regular: N, low: N },
    avg_salary: { NZ: N, AU: N, ES: N },
    new_today: N,
    applied: N,
    portals_health: [{ name, last_fetch, status, count }]
  }

PATCH /api/v2/jobs/:id/status
  Body: { status: 'saved'|'applied'|'interview'|'offer'|'rejected'|'hidden' }
  Response: { listing: {...} }

POST /api/v2/jobs/:id/notes
  Body: { note: 'Called HR, interview next week' }
  Response: { listing: {...} }

GET /api/v2/jobs/portals
  Response: { portals: [...], stats: { active: N, errored: N } }

PATCH /api/v2/jobs/portals/:id
  Body: { is_active: bool, fetch_interval: '4h' }

POST /api/v2/jobs/search
  Body: { query: 'warehouse Christchurch', country: 'NZ' }
  Response: { listings: [...] }  // busqueda on-demand via Adzuna/Careerjet

GET /api/v2/profile
  Response: { skills: [...], languages: [...], experience: {...}, preferences: {...} }

PUT /api/v2/profile
  Body: { skills: [...], preferred_countries: [...], ... }
```

---

## 8. Frontend — Navegacion y UX

### Estructura

```
Employment (tab principal)
├── Dashboard (default)
│   ├── Score cards: total ofertas, nuevas hoy, aplicadas, entrevistas
│   ├── Top 10 por score (auto-refresh)
│   └── Grafico: ofertas por dia (ultimos 30 dias)
│
├── By Country — drill down geografico
│   ├── NZ (mapa simple o tabs de regiones)
│   │   ├── Christchurch — warehouse, logistics, tech
│   │   ├── Auckland — tech, hospitality
│   │   ├── Bay of Plenty — seasonal, warehouse
│   │   └── Remote NZ
│   ├── AU
│   │   ├── Melbourne, Sydney, Brisbane
│   │   └── Remote AU
│   ├── ES
│   │   ├── Madrid, Barcelona
│   │   └── Remote ES
│   └── Remote (Global)
│       └── Dev, design, support
│
├── By Sector — drill down por tipo de trabajo
│   ├── Warehouse / Logistics
│   ├── Tech / Software Dev
│   ├── Hospitality
│   ├── Construction
│   └── Agriculture / Seasonal
│
├── Applied — tracking de postulaciones
│   ├── Pipeline: New → Saved → Applied → Interview → Offer/Rejected
│   └── Timeline con notas
│
├── Portals — admin de fuentes
│   └── Lista con status, ultimo fetch, error count, toggle on/off
│
└── Profile — configurar skills, preferencias, pesos de scoring
```

### Componentes UI clave

- **JobCard:** titulo, empresa, ubicacion, salario, fecha, score total (badge color), score breakdown (mini bars: match/speed/ease), source badge, status chip
- **ScoreBreakdown:** popup/tooltip que muestra los 3 sub-scores y por que
- **CountryTabs:** NZ / AU / ES / Remote con count badges
- **SectorFilter:** chips toggleables
- **SalaryRange:** slider dual (min-max)
- **ApplicationPipeline:** kanban-style board (New → Saved → Applied → Interview → Offer/Rejected)
- **QuickActions:** "Save", "Apply" (link externo), "Hide", "Add Note"

---

## 9. Conexion con Otros Pilares

### P1 Noticias ↔ P2 Empleo

```
Cuando un job listing menciona una empresa:
  → Buscar en news_articles: "company_name" en titulo/summary
  → Mostrar badge: "3 noticias recientes sobre esta empresa"
  → Click abre panel lateral con noticias relevantes
  
Cuando una noticia menciona layoffs/contrataciones:
  → Extraer nombre de empresa
  → Cross-reference con emp_listings de esa empresa
  → Alert: "Amazon NZ anuncia expansion — 5 ofertas abiertas"
```

### P3 Finanzas ↔ P2 Empleo

```
Para cada oferta con salario:
  → Calcular salario mensual neto (estimacion con tax brackets por pais)
  → Comparar con gastos mensuales del usuario (de tabla finances)
  → Mostrar: "Este salario cubre X% de tus gastos"
  → Si el usuario cambia de pais: estimar diferencia de costo de vida

Salario por pais (estimaciones tax):
  NZ: salary * 0.70 (aprox tax+ACC)
  AU: salary * 0.72 (aprox tax+super)
  ES: salary * 0.65 (aprox IRPF+SS)
```

### P6 Logistica ↔ P2 Empleo

```
Si la oferta es en otra ciudad/pais:
  → Estimar costo de mudanza (de tabla logistics + estimaciones)
  → NZ→AU: ~$2000-3000 NZD (vuelos + primer mes)
  → NZ→ES: ~$5000-8000 NZD (vuelos + visado + primer mes)
  → Mostrar: "Costo estimado de reubicacion: $X"
  → Link a crear logistica entry si el usuario decide aplicar

Si hay logistics entries pendientes (vuelos, alojamiento):
  → Mostrar en la oferta: "Ya tienes vuelo a Melbourne el 15/05"
```

### P4 Burocracia ↔ P2 Empleo

```
Si el trabajo requiere documentos:
  → Verificar en document_alerts si los tiene y si estan vigentes
  → "Visa NZ: vigente hasta 2027-01-15" ✓
  → "Licencia de conducir: vence en 30 dias" ⚠
  → "Forklift license: no registrada" ✗
```

### P5 Oportunidades ↔ P2 Empleo

```
Freelance opportunities (P5) pueden complementar employment (P2):
  → Si no hay ofertas de empleo con buen score en un sector
  → Sugerir: "Considera freelance: 3 proyectos React en Freelancer.com"
```

---

## 10. Problemas Anticipados

### Bloqueos y Anti-Bot

| Portal | Riesgo | Mitigacion |
|--------|--------|------------|
| Indeed | Alto (Cloudflare + CAPTCHA) | Usar Adzuna como proxy. JobSpy GraphQL API como fallback |
| LinkedIn | Muy alto | Solo via JobSpy con proxies, limitar a 50 results/run |
| SEEK | Alto (Cloudflare) | Adzuna agrega SEEK. No scraping directo |
| Freelancer | Medio | Selectores cambian. Usar API oficial |
| Todos | Variable | Rotar User-Agent, respetar delays, monitorear health |

### CAPTCHAs
- Adzuna/Careerjet/Jooble: No tienen (son APIs oficiales)
- Indeed/SEEK directo: Si, agresivos. Por eso usamos APIs intermediarias
- Trade Me: No para API autorizada
- Playwright scrapers: Posible. Usar `playwright-extra` + stealth plugin

### Portales sin API que cambian estructura
- Tecnoempleo, PickNZ, MyJobSpace: pueden romper selectores CSS
- Mitigacion: monitorear `error_count` por portal, alertar via Telegram si >3 fallos consecutivos
- Fallback: agregar nuevos selectores, o desactivar temporalmente

### Duplicados cross-portal
- La misma oferta de SEEK aparece en Adzuna, Careerjet, Jooble, Indeed
- Las 3 capas de dedup (URL, URL normalizada, composite key) deberian atrapar >90%
- Tracking de `duplicate_of` permite ver "en N portales"

### Salarios inconsistentes
- NZ muestra salary en NZD anual o por hora
- AU en AUD anual
- ES en EUR anual o mensual
- Remote en USD anual
- Mitigacion: parsear + normalizar a anual en moneda local. Tabla de conversion rates (ya existe `conversion_rates.js`)

### Rate limits de APIs gratuitas
- Adzuna: 1000/hr — suficiente para ~12 queries cada 4h
- Careerjet: 1000/hr — suficiente
- Jooble: no documentado pero generoso
- Remote OK: 2 req/min — suficiente (1 call cada 6h)
- Remotive: 4 fetches/dia maximo
- Mitigacion: nunca exceder, implementar backoff exponencial

### Privacidad y compliance
- No almacenar datos personales de otros candidatos
- Solo almacenar job listings publicos
- Respetar robots.txt de cada sitio
- Trade Me API: cumplir con terms of service del OAuth app
- InfoJobs API: cumplir con terms (no republicar datos)

---

## Resumen de Fases

### Fase 1 — APIs Directas (Implementar ahora)

- [ ] Migrar schema: `job_sources`→`emp_portals`, `job_listings`→`emp_listings` con nuevos campos
- [ ] Crear tabla `emp_profile` con skills, languages, preferences
- [ ] Crear tabla `emp_applications` para tracking de postulaciones
- [ ] Refactorizar `adzuna_params.js` para soportar NZ+AU+ES (no solo NZ)
- [ ] Integrar APIs nuevas: Trade Me, InfoJobs, Remote OK, Himalayas, Careerjet, Jooble, WWR RSS
- [ ] Implementar normalization layer (schema unificado)
- [ ] Implementar scoring engine (match, speed, difficulty, total)
- [ ] Implementar dedup de 3 capas
- [ ] API endpoints: /jobs, /jobs/:id, /jobs/stats, /jobs/portals, /profile
- [ ] Frontend: dashboard + country view + sector view + application tracking
- [ ] Alertas Telegram: ofertas con score > 75

### Fase 2 — Scrapers Avanzados

- [ ] Integrar jobspy-js para Indeed/LinkedIn/Glassdoor
- [ ] Cheerio scrapers: Tecnoempleo, PickNZ, MyJobSpace, MSD NZ
- [ ] Cross-pillar connections (noticias ↔ empleo, finanzas ↔ empleo)
- [ ] Salary normalization multi-moneda
- [ ] Application pipeline UI (kanban board)

### Fase 3 — ML y Enriquecimiento

- [ ] NLP job matching con SBERT/MiniLM embeddings
- [ ] Salary estimation para ofertas sin salario
- [ ] Company intelligence (cruzar con noticias, Glassdoor ratings)
- [ ] Recomendaciones proactivas ("empresas que contratan tu perfil en NZ")
