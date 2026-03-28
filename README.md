# 🌎 ULTRA SYSTEM — Sistema de Inteligencia Personal

> _"Una extensión de tu cerebro en la nube — 100% código propio"_

Sistema operativo personal para nómadas digitales. Diseñado para automatizar la burocracia, vigilar oportunidades y tomar el control del caos del día a día desde un VPS de 4€. **Sin herramientas de terceros.**

---

## ⚡ Stack

| Componente | Tecnología | Nota |
|-----------|-----------|------|
| Backend | Node.js + Express | API REST + Scheduler + Bot |
| Dashboard | HTML/CSS/JS | Dark theme premium |
| OCR | Tesseract.js | ESP + ENG bilingüe |
| RSS | rss-parser | Reemplaza Miniflux |
| Scraper | Cheerio | Reemplaza Changedetection |
| Bot | node-telegram-bot-api | Reemplaza n8n |
| Base de datos | PostgreSQL 16 | Única dependencia |
| Contenedores | **2** (db + engine) | Antes eran 8 |

---

## 🏗️ Los 7 Pilares

| # | Pilar | Estado | Descripción |
|---|-------|--------|-------------|
| 1 | 📰 Noticias | `✅ ACTIVO` | RSS reader propio → dashboard |
| 2 | 💼 Empleo Físico | `✅ ACTIVO` | Web scraper propio → alertas |
| **4** | **📂 Burocracia** | **`✅ ACTIVO`** | **OCR + alertas documentos** |
| 3 | 💰 Finanzas | `⏳ Pendiente` | Control automático Wise + Runway |
| 5 | 🌐 Oportunidades | `⏳ Pendiente` | Freelance remoto filtrado |
| 6 | 🚗 Logística | `⏳ Pendiente` | Gasolina + clima + ruta |
| 7 | 🧬 Bio-Check | `⏳ Pendiente` | Dashboard energía y progreso |

---

## 🚀 Quick Start

```bash
# 1. Clonar en tu Hetzner
git clone <tu-repo> ~/ultra-system && cd ~/ultra-system

# 2. Configurar credenciales
cp .env.example .env
nano .env  # ← Cambia TODOS los "CAMBIA_ESTO"

# 3. Desplegar
bash scripts/deploy.sh
```

**Acceso:**
- 🌐 Dashboard: `http://<TU_IP>`
- 📡 API: `http://<TU_IP>/api/status`
- 🤖 Telegram: Envía `/start` a tu bot

---

## 📁 Estructura

```
ultra-system/
├── docker-compose.yml          # Solo 2 servicios: db + engine
├── .env.example                # Variables (PostgreSQL + Telegram)
├── db/
│   └── init.sql                # Schema completo (8 tablas)
├── ultra-engine/               # ★ Todo tu código propio
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js               # Punto de entrada
│   ├── src/
│   │   ├── db.js               # PostgreSQL pool
│   │   ├── telegram.js         # Bot de Telegram
│   │   ├── scheduler.js        # Cron jobs (reemplaza n8n)
│   │   ├── ocr.js              # OCR (reemplaza Paperless)
│   │   ├── rss.js              # RSS reader (reemplaza Miniflux)
│   │   ├── scraper.js          # Scraper (reemplaza Changedetection)
│   │   └── routes/
│   │       ├── documents.js    # API documentos
│   │       ├── status.js       # API estado
│   │       ├── feeds.js        # API noticias
│   │       └── jobs.js         # API empleo
│   └── public/                 # Dashboard web
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js
├── scripts/
│   ├── deploy.sh
│   └── backup.sh
└── docs/
    └── ARCHITECTURE.md
```

---

## 📜 Licencia

Proyecto personal. Uso privado.
