# 📋 Inventario Completo de Proyectos, Herramientas y Configuración

**Fecha:** 27 de Marzo de 2026  
**Autor:** Auditoría automatizada  
**Ubicación Base:** `C:\Users\ibrab\Desktop\`

---

## Resumen Ejecutivo

Se han identificado **7 proyectos activos** y **2 recursos auxiliares** en el escritorio. El ecosistema técnico abarca desde sistemas operativos bare-metal en C/ASM hasta bots de trading en Python, pasando por aplicaciones SaaS full-stack en React/TypeScript y sitios web estáticos con Firebase. Todo el stack de infraestructura de servidor converge en un único VPS de Hetzner.

### Mapa de Proyectos

| # | Proyecto | Lenguaje | Categoría | Estado |
|---|----------|----------|-----------|--------|
| 1 | **Ultra System** (`vida, control/`) | Node.js | Automatización Personal | 🟡 Pendiente deploy |
| 2 | **CT4 Trading Bot** (`Crypto-Trading-Bot4/`) | Python | Trading Algorítmico | 🟢 Live testing |
| 3 | **HarvestPro NZ** (`harvestpro-nz/`) | React/TS | SaaS Agrícola | 🟡 En desarrollo |
| 4 | **ALZ Agency** (`money/`) | HTML/CSS/JS | Web Corporativa | 🟢 Desplegado (Firebase) |
| 5 | **Anykernel OS** (`alze os/`) | C/ASM | Sistema Operativo | 🟡 Bug en SMP |
| 6 | **Alze OS v2** (`alze-os/`) | — | Referencia vacía | ⚪ Solo CLAUDE.md |
| 7 | **Set Up** (`set up/`) | Python | Scripts de Servidor | 🟢 Utilidad activa |

### Navegadores Configurados (`navegador/`)
- Brave Browser
- Tor Browser
- Zen Browser

---

## 1. 🌎 Ultra System — Sistema Operativo Personal

> **Ruta:** `vida, control/`  
> **Propósito:** Automatización de burocracia, noticias, empleo y gestión documental para nómadas digitales. Reemplaza 8 herramientas de terceros con un motor custom.

### Stack Tecnológico

| Capa | Herramienta | Versión | Rol |
|------|-------------|---------|-----|
| Runtime | **Node.js** | 22.x (Alpine) | Motor principal |
| Framework | **Express** | ^5.1.0 | API REST + servidor estático |
| Base de Datos | **PostgreSQL** | 16-alpine | Única dependencia externa |
| OCR | **Tesseract.js** | ^5.1.1 | Extracción de texto de documentos |
| RSS | **rss-parser** | ^3.13.0 | Lectura de feeds de noticias |
| Scraping | **Cheerio** | ^1.0.0 | Análisis de HTML estático |
| Bot | **node-telegram-bot-api** | ^0.66.0 | Alertas y comandos remotos |
| Cron | **node-cron** | ^3.0.3 | Programación de tareas |
| Upload | **Multer** | ^1.4.5-lts.1 | Subida de archivos |
| PDF | **pdf-parse** | ^1.1.1 | Extracción directa de texto PDF |
| Env | **dotenv** | ^16.4.0 | Variables de entorno |

### Contenedores Docker

| Servicio | Imagen | Puerto | Volúmenes |
|----------|--------|--------|-----------|
| `ultra_db` | `postgres:16-alpine` | 5432 (interno) | `ultra_pgdata:/var/lib/postgresql/data` |
| `ultra_engine` | Build custom (`./ultra-engine`) | 80:3000 | `ultra_uploads:/app/uploads` |

### Variables de Entorno (`.env`)

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `POSTGRES_USER` | Usuario de la BD | `ultra_user` |
| `POSTGRES_PASSWORD` | Contraseña de la BD | `(secreto)` |
| `POSTGRES_DB` | Nombre de la BD | `ultra_db` |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram | `123456789:ABC...` |
| `TELEGRAM_CHAT_ID` | ID del chat de destino | `(número)` |
| `TZ` | Zona horaria | `Pacific/Auckland` |

### Base de Datos — 8 Tablas

| Tabla | Propósito |
|-------|-----------|
| `document_alerts` | Documentos con fechas de expiración y alertas |
| `user_status` | Estado del sistema y configuración |
| `notification_log` | Historial de notificaciones enviadas |
| `uploaded_files` | Archivos subidos con texto OCR extraído |
| `rss_feeds` | Fuentes RSS configuradas |
| `rss_articles` | Artículos capturados |
| `job_sources` | URLs de páginas de empleo vigiladas |
| `job_listings` | Ofertas de empleo detectadas |
| `scheduler_log` | Registro de ejecución de cron jobs |

### Cron Jobs Configurados

| Job | Horario | Función |
|-----|---------|---------|
| `document-expiry-check` | Lunes 09:00 | Revisar documentos próximos a caducar |
| `urgent-document-check` | Diario 08:00 | Alertas urgentes (<7 días) |
| `rss-fetch` | Cada 30 min | Buscar nuevas noticias |
| `job-scrape` | Cada 6 horas | Buscar ofertas de empleo |
| `health-ping` | Cada hora | Verificar salud de la BD |

### Scripts de Operaciones

| Script | Función |
|--------|---------|
| `scripts/deploy.sh` | Despliegue completo en Hetzner |
| `scripts/backup.sh` | Backup de BD + uploads |
| `deploy_hetzner.js` | Script Node.js para subida SFTP automática |

### Estado de Despliegue
- **Archivos subidos a Hetzner:** ✅ Sí
- **Docker build completado:** ✅ Sí
- **Bloqueo actual:** Puerto 80 ocupado por contenedores antiguos
- **Acción pendiente:** `docker stop $(docker ps -aq) && docker rm $(docker ps -aq)`

---

## 2. 🎯 CT4 — Crypto Trading Bot v4

> **Ruta:** `Crypto-Trading-Bot4/`  
> **Propósito:** Bot de trading algorítmico que opera criptomonedas en Binance usando estrategias cuantitativas. Filosofía "Sniper": solo dispara cuando 4 condiciones se alinean.

### Stack Tecnológico

| Capa | Herramienta | Versión | Rol |
|------|-------------|---------|-----|
| Runtime | **Python** | 3.13 | Motor principal |
| Exchange | **ccxt** | >=4.2.0 | API de exchanges (Binance) |
| WebSocket | **websockets** | >=12.0 | Streaming de datos en tiempo real |
| API | **FastAPI** | >=0.110.0 | Dashboard HTTP + API |
| Server | **Uvicorn** | >=0.30.0 | Servidor ASGI |
| Data | **Pandas** | >=2.2.0 | Análisis de datos |
| Indicadores | **pandas-ta** | >=0.3.14b | Indicadores técnicos (RSI, EMA, ATR, ADX, BB) |
| Base de Datos | **aiosqlite** | >=0.20.0 | Persistencia async local |
| HTTP | **aiohttp** | >=3.9.0 | News Engine async |
| Alertas | **python-telegram-bot** | >=21.0 | Notificaciones |
| Testing | **pytest + pytest-asyncio** | >=8.0 | Test suite |
| Env | **python-dotenv** | >=1.0.1 | Variables de entorno |

### Arquitectura de 4 Motores

| Motor | Archivo | Función |
|-------|---------|---------|
| **Data Engine** | `engines/data_engine.py` | WebSocket + REST candle data |
| **Alpha Engine** | `engines/alpha_engine.py` | Lógica de estrategia (4 Leyes) |
| **Execution Engine** | `engines/execution_engine.py` | Colocación de órdenes (Market + SL/TP) |
| **Risk Engine** | `engines/risk_engine.py` | Position sizing, drawdown, kill switch |
| **Backtest Engine** | `engines/backtest_engine.py` | Backtesting histórico |

### Estrategias Implementadas

| Estrategia | Condición de Entrada | SL | TP | Estado |
|------------|---------------------|----|----|--------|
| **AllIn RSI<30** | RSI7 < 30 → compra | -3% | +5% | ✅ Activa (principal) |
| **MomBurst+** | Vela verde >0.8% + Vol 2.5x | -2% | +4% | ✅ Activa (secundaria) |
| **4 Laws Sniper** | EMA200 + ADX>20 + Vol>SMA20 + RSI<35 | ATR | ATR×2 | ✅ Activa (legacy) |

### Las 4 Leyes del Sniper

| # | Ley | Condición | Propósito |
|---|-----|-----------|-----------|
| 🌊 | La Marea | Price > EMA 200 | Solo operar a favor de la macrotendencia |
| 💪 | La Fuerza | ADX > 20 | Confirmar tendencia real (no lateral) |
| 🐋 | Las Ballenas | Volume > SMA(20) | Asegurar participación institucional |
| 🩸 | El Pullback | RSI < 35 + Rebote | Comprar el retroceso, no el crash |

### Configuración de Trading

| Parámetro | Valor |
|-----------|-------|
| Exchange | Binance (Testnet → Mainnet) |
| Símbolos | XRP/USDT, DOGE/USDT, AVAX/USDT, SHIB/USDT, SOL/USDT |
| Timeframe | 5m |
| Position Risk | 90% all-in (Sniper Rotativo) |
| Max Daily Drawdown | 10% (Kill Switch) |
| Trailing Stop | 2% |

### Dashboard y API

| Componente | Archivo | Puerto |
|------------|---------|--------|
| API HTTP | `api/server.py` | Local |
| Dashboard | `dashboard.html` (34KB) | Servido por FastAPI |
| Monitor Server | `monitor_server.py` (64KB) | Standalone "Ojo de Dios" |
| Scoring AI | `scoring_ai/` | Módulo de ML para scoring |

### Archivos de Datos Generados
- `v15_remote_trades.csv` — Trades remotos del bot v15
- `v15_chart.html` — Gráfica interactiva (4.8MB)
- Múltiples scripts de backtest (`backtest_v12.py`, `backtest_v14_compare.py`)
- Multi-strategy generator (`generate_multi_strategy.py`)

---

## 3. 🌿 HarvestPro NZ — SaaS de Gestión Agrícola

> **Ruta:** `harvestpro-nz/`  
> **Propósito:** App móvil/web para gestión de cosechas, control de trabajadores y cumplimiento laboral en Nueva Zelanda. Versión v9.9.0.

### Stack Tecnológico

| Capa | Herramienta | Versión | Rol |
|------|-------------|---------|-----|
| Framework | **React** | ^19.2.3 | UI principal |
| Build | **Vite** | (config) | Bundler y dev server |
| Lenguaje | **TypeScript** | (config) | Tipado estático |
| Estado | **Zustand** | ^5.0.11 | State management |
| Routing | **React Router** | ^7.13.0 | Navegación SPA |
| Validación | **Zod** | ^4.3.6 | Schema validation |
| Fetching | **TanStack React Query** | ^5.90.21 | Server state management |
| Backend | **Supabase** | ^2.39.0 | Auth, DB, Edge Functions, Storage |
| Offline DB | **Dexie** | ^3.2.4 | IndexedDB para modo offline |
| CSS | **TailwindCSS** | (via `@tailwindcss/forms`) | Framework CSS |
| Icons | **Lucide React** | ^0.563.0 | Iconos |
| Charts | **web-vitals** | ^5.1.0 | Métricas |
| Fechas | **date-fns** | ^4.1.0 | Manipulación de fechas |
| Export | **PapaParse** | ^5.5.3 | Export CSV |
| QR | **html5-qrcode** | ^2.3.8 | Escaneo de códigos QR |
| Crypto | **crypto-js** | ^4.2.0 | Cifrado de datos |
| Mobile | **Capacitor** | ^8.2.0 | Build nativo Android |
| Analytics | **PostHog** | ^1.345.3 | Telemetría |
| Error Tracking | **Sentry** | ^10.39.0 | Monitoreo de errores |

### DevDependencies Clave

| Herramienta | Versión | Rol |
|-------------|---------|-----|
| **Vitest** | (config) | Unit testing |
| **Playwright** | ^1.58.2 | E2E testing |
| **Testing Library** | ^16.3.2 | Component testing |
| **Storybook** | ^10.2.16 | Desarrollo de componentes |
| **ESLint** | ^8.57.0 | Linting |
| **Prettier** | (config) | Formateo |
| **Husky** | (config) | Git hooks |
| **cross-env** | — | Variables cross-platform |

### Supabase (Backend-as-a-Service)

| Recurso | Cantidad | Descripción |
|---------|----------|-------------|
| Migraciones SQL | **30+** | Evolución del schema (auth, RLS, payroll, etc.) |
| Edge Functions | **11** | Serverless TypeScript |
| Seeds | **7** | Datos de prueba (orchards, harvest, accounts) |
| Schema consolidado | `schema_v3_consolidated.sql` | Estado actual de la BD |

#### Migraciones Notables
- `auth_hardening.sql` — Endurecimiento de autenticación
- `rls_consolidation.sql` — Row Level Security
- `payroll_rpc.sql` — Cálculo de nóminas
- `push_subscriptions.sql` — Push notifications
- `privacy_consent.sql` — GDPR/Privacy
- `saas_expansion.sql` — Multi-tenant SaaS
- `tenant_isolation_rls.sql` — Aislamiento por empresa

### Variables de Entorno

| Variable | Servicio |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase |
| `VITE_SUPABASE_ANON_KEY` | Supabase |
| `VITE_GEMINI_API_KEY` | Google Gemini (AI features) |
| `VITE_VAPID_PUBLIC_KEY` | Web Push Notifications |
| `VITE_ENABLE_ANALYTICS` | PostHog toggle |

### Testing
- **2,400+ tests passing** (488 unit + 89 integration + más)
- **49.92% line coverage**
- Playwright E2E suite configurado

---

## 4. 💰 ALZ Agency — Web Corporativa CRO

> **Ruta:** `money/`  
> **Propósito:** Landing page de agencia de Conversion Rate Optimization (CRO) con IA. Web estática desplegada en Firebase Hosting.

### Stack Tecnológico

| Capa | Herramienta | Rol |
|------|-------------|-----|
| Estructura | **HTML5** | Páginas estáticas |
| Estilos | **CSS3** (53KB) | Dark Glassmorphism Premium |
| Tipografía | **Space Grotesk + JetBrains Mono** | Google Fonts |
| Animaciones | **GSAP** | Scroll reveals, counters, parallax |
| 3D | **Three.js** | Partículas en background |
| Hosting | **Firebase Hosting** | CDN global |
| Analytics | **Google Analytics GA4** | `G-4T4PHY53HV` |
| Workflows | **n8n** | CRM y automatización de leads |

### Páginas

| Página | Archivo | Tamaño |
|--------|---------|--------|
| Landing Principal | `index.html` | 42KB |
| Blog: CRO Básico | `blog-cro-basico.html` | 9.6KB |
| Blog: Landing Pages | `blog-landing-page.html` | 8.3KB |
| Contacto | `contact.html` | 10.9KB |
| Cookies | `cookies.html` | 7.1KB |
| Privacidad | `privacy.html` | 6.4KB |
| Términos | `terms.html` | 6.7KB |

### Internacionalización
- **5 idiomas:** ES, EN, PT, FR, DE
- Archivo: `translations.js` (34.8KB)
- Cambio de idioma en tiempo real

### SEO
- Meta tags completos
- Open Graph + Twitter Cards
- JSON-LD Structured Data
- `robots.txt` + `sitemap.xml`

### Integración n8n
- `lead-capture.json` — Workflow de captura de leads
- `n8n_CRM_Node.json` — Nodo de CRM
- Documentación: `n8n-workflow-guide.md`

---

## 5. 🖥️ Anykernel OS — Sistema Operativo Bare-Metal

> **Ruta:** `alze os/`  
> **Propósito:** Kernel x86_64 construido desde cero en C y Assembly. Proyecto educativo/investigación de sistemas operativos.

### Stack Tecnológico

| Capa | Herramienta | Versión | Rol |
|------|-------------|---------|-----|
| Lenguaje | **C** | GNU11 | Código del kernel |
| Assembly | **NASM** | elf64 | Bajo nivel (interrupciones, context switch) |
| Compilador | **Clang** | target x86_64-unknown-none | Cross-compilation |
| Linker | **ld.lld** | — | Linkeo del kernel ELF |
| Bootloader | **Limine** | v3 | BIOS + UEFI boot |
| Emulador | **QEMU** | q35, 8 CPUs, 128MB | Virtualización y debug |
| Build | **GNU Make** | — | Sistema de build |
| Debug | **GDB** | — | Depuración remota |
| ISO | **xorriso** | — | Creación de ISO booteable |
| Entorno Windows | **MSYS2 MinGW** | — | Toolchain POSIX en Windows |

### Subsistemas del Kernel

| Subsistema | Archivos | Descripción |
|------------|----------|-------------|
| **Boot/CPU** | `main.c`, `gdt.c`, `idt.c` | GDT/TSS, IDT (256 vectores), CPUID |
| **Memoria** | `pmm.c`, `vmm.c`, `kmalloc.c` | Buddy allocator, 4-level paging, Slab |
| **Scheduler** | `sched.c`, `context_switch.asm` | Preemptivo round-robin, 3 prioridades |
| **Sync** | Spinlock, Mutex, Semaphore, WaitQueue | Primitivas de sincronización |
| **IPC** | Message Queue | Comunicación inter-procesos |
| **Filesystem** | `vfs.c`, `ramfs.c`, `devfs.c`, `procfs.c`, `ext2.c` | VFS + 4 implementaciones |
| **Drivers** | `e1000.c`, `ahci.c`, `xhci.c` | Red (Intel), SATA, USB 3.0 |
| **Syscalls** | `syscall_entry.asm` | Ring 3 → Ring 0 |
| **SMP** | `smp.c`, `ap_trampoline_flat.asm` | Multi-core (8 CPUs) |
| **Userland** | `init`, `shell`, `hello` + mini libc | Programas de usuario |

### Métricas

| Métrica | Valor |
|---------|-------|
| Versión | v0.4.4 (v0.5.x en sprint de excelencia) |
| Líneas de código | ~26,000 (C + NASM) |
| Archivos kernel | 165 |
| Tamaño del kernel | 76 KB |
| Tiempo de boot | 90 ms |
| Tests | 35 kernel + 5 runtime |
| Warnings | 0 (`-Werror`) |

### Bug Conocido
- **Triple Fault** en instrucción `ltr` al despertar AP1 vía SIPI (startup SMP)
- Feature freeze mientras se depura

---

## 6. 🔧 Set Up — Scripts de Servidor y DevOps

> **Ruta:** `set up/`  
> **Propósito:** Colección de scripts Python para administrar el VPS de Hetzner. Incluye configuración de n8n, Nginx, SSL, Telegram bots y dashboards remotos.

### Stack

| Herramienta | Uso |
|-------------|-----|
| **Python** | Scripts de administración |
| **ssh2** (Node.js) | Conexión SSH programática |
| **n8n** | Orquestación de workflows (en el servidor) |
| **Nginx** | Reverse proxy + SSL |
| **Docker / Docker Compose** | Contenedores en Hetzner |
| **Let's Encrypt / Certbot** | Certificados SSL |
| **UFW** | Firewall |
| **OpenRouter** | API de modelos de IA |

### Categorías de Scripts (~140 archivos)

| Categoría | Scripts | Ejemplo |
|-----------|---------|---------|
| **n8n Management** | ~25 | `deploy_n8n_hetzner.py`, `fix_n8n_proxy.py`, `import_workflows_hetzner.py` |
| **Nginx/SSL** | ~15 | `fix_nginx_alias.py`, `fase3_ssl_dashboard.py`, `kill_rogue_and_start_nginx.py` |
| **Docker** | ~10 | `inspect_docker.py`, `fetch_docker_logs.py` |
| **Telegram Bot** | ~8 | `create_telegram_ai_bot.py` (v1, v2, v3), `debug_telegram.py` |
| **Dashboard** | ~8 | `dashboard.html`, `fix_dashboard_port.py`, `read_dashboard.py` |
| **Diagnostics** | ~12 | `diag_server.py`, `check_ports.py`, `check_ssl_prereqs.py` |
| **Workflows** | ~10 | JSON workflows (daily briefing, crypto alerts, uptime monitor, github backup) |
| **Deploy** | ~5 | `deploy_ct4.py`, `deploy_chat_widget.py`, `fase2_deploy.py` |

### Workflows de n8n Exportados

| Workflow | Archivo | Función |
|----------|---------|---------|
| Lead Capture | `lead-capture.json` | Captura de leads del formulario web |
| Daily Briefing | `daily_briefing_fixed.json` | Resumen diario por Telegram |
| Crypto Alerts | `crypto_portfolio_alerts_fixed.json` | Alertas de precio crypto |
| Uptime Monitor | `uptime_monitor_fixed.json` | Monitoreo de servicios |
| GitHub Backup | `github_auto-backup_fixed.json` | Backup automático a GitHub |
| AI Agent | `patched_agent.json` | Agente con OpenRouter |

---

## 7. 🖥️ Alze OS v2 (Referencia)

> **Ruta:** `alze-os/`  
> **Estado:** Solo contiene `CLAUDE.md` — es una referencia/espejo del proyecto principal de Anykernel OS. Probablemente un directorio temporal.

---

## Infraestructura Compartida

### Servidor Hetzner VPS

| Dato | Valor |
|------|-------|
| **IP** | `95.217.158.7` |
| **Plan** | CX23 (2 vCPU, 4GB RAM, 40GB SSD) |
| **OS** | Linux (probablemente Ubuntu/Debian) |
| **Docker** | ✅ Instalado con Docker Compose |
| **Nginx** | ✅ Reverse proxy configurado |
| **SSL** | ✅ Let's Encrypt |
| **UFW** | ✅ Firewall activo |

### Servicios Activos en el Servidor (Pre-Migración)

| Servicio | Puerto | Estado |
|----------|--------|--------|
| n8n | 5678 (proxy vía Nginx) | 🟢 Activo |
| Homepage | 80 | 🟢 Activo (bloqueando Ultra Engine) |
| Otros containers legacy | Varios | 🟡 Por eliminar |

### Servicios Planificados (Post-Migración)

| Servicio | Puerto | Contenedor |
|----------|--------|------------|
| Ultra Engine | 80:3000 | `ultra_engine` |
| PostgreSQL | 5432 (interno) | `ultra_db` |

### APIs y Servicios Externos Utilizados

| Servicio | Usado por | Tipo | Coste |
|----------|-----------|------|-------|
| **Binance API** | CT4 Bot | Exchange crypto | Gratis |
| **Telegram Bot API** | Ultra System, CT4, Set Up | Mensajería | Gratis |
| **Supabase** | HarvestPro | BaaS (Auth, DB, Functions) | Free tier |
| **Firebase Hosting** | ALZ Agency (money) | CDN + Hosting | Free tier |
| **Google Analytics GA4** | ALZ Agency | Analytics | Gratis |
| **PostHog** | HarvestPro | Analytics | Free tier |
| **Sentry** | HarvestPro | Error tracking | Free tier |
| **Google Gemini API** | HarvestPro | IA | Pay-per-use |
| **OpenRouter** | Set Up (n8n AI agent) | Multi-model API | Pay-per-use |
| **Hetzner Cloud** | Todo | VPS | ~€5/mes |

---

## Herramientas de Desarrollo Locales

| Herramienta | Proyectos | Propósito |
|-------------|-----------|-----------|
| **VS Code / Windsurf** | Todos | Editor principal |
| **Git** | Todos | Control de versiones |
| **Node.js** | Ultra, ALZ, HarvestPro, Set Up | Runtime JS |
| **Python 3.13** | CT4, Set Up | Runtime Python |
| **npm** | Ultra, HarvestPro | Package manager |
| **pip / venv** | CT4 | Package manager Python |
| **Docker Desktop** | Ultra System | Contenedores locales |
| **MSYS2 MinGW** | Anykernel OS | Toolchain C en Windows |
| **QEMU** | Anykernel OS | Emulación de hardware |
| **Make** | Anykernel OS | Build system |
| **Clang + NASM** | Anykernel OS | Compilador + Ensamblador |

---

## Resumen de Líneas de Código Estimadas

| Proyecto | Lenguaje | Líneas Estimadas |
|----------|----------|-----------------|
| Anykernel OS | C/ASM | ~26,000 |
| CT4 Trading Bot | Python | ~15,000 |
| HarvestPro NZ | TypeScript/React | ~50,000+ |
| Ultra System | Node.js/JS | ~2,500 |
| ALZ Agency | HTML/CSS/JS | ~5,000 |
| Set Up Scripts | Python | ~8,000 |
| **Total** | **Multi** | **~106,500** |
