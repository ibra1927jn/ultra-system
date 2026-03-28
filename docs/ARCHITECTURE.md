# 🏗️ Arquitectura — Ultra System (Custom)

## Vista General

```
┌─────────────────────────────────────────────────────────┐
│                  HETZNER VPS (CX23)                      │
│                  Ubuntu + Docker                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │          ultra-engine (Node.js)     :80            │  │
│  │                                                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │
│  │  │ API REST │ │ Scheduler│ │ Telegram │           │  │
│  │  │ Express  │ │ node-cron│ │ Bot      │           │  │
│  │  └──────────┘ └──────────┘ └──────────┘           │  │
│  │                                                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐           │  │
│  │  │ OCR      │ │ RSS      │ │ Scraper  │           │  │
│  │  │Tesseract │ │rss-parser│ │ Cheerio  │           │  │
│  │  └──────────┘ └──────────┘ └──────────┘           │  │
│  │                                                     │  │
│  │  ┌──────────────────────────────────────────────┐  │  │
│  │  │ Dashboard Web (HTML/CSS/JS estático)         │  │  │
│  │  └──────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┬───┘  │
│                                                    │      │
│  ┌─────────────────────────────────────────────────┘      │
│  │  PostgreSQL 16 Alpine (única dependencia)      │      │
│  └────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
                         │
                  ┌──────┴──────┐
                  │  Telegram   │
                  │  Bot API    │
                  │  📲 Samsung │
                  └─────────────┘
```

## Qué reemplaza cada módulo

| Módulo propio | Reemplaza | Librería usada |
|--------------|-----------|----------------|
| `scheduler.js` | n8n | `node-cron` |
| `ocr.js` | Paperless-ngx | `tesseract.js` + `pdf-parse` |
| `rss.js` | Miniflux | `rss-parser` |
| `scraper.js` | Changedetection.io + Playwright | `cheerio` + `fetch` |
| `telegram.js` | n8n Telegram node | `node-telegram-bot-api` |
| Dashboard HTML | Homepage + Grafana | Vanilla HTML/CSS/JS |
| PostgreSQL pool | Redis | `pg` (directo) |

## Modelo de Datos

```
┌─────────────────────┐     ┌─────────────────────┐
│  document_alerts    │     │  notification_log   │
├─────────────────────┤     ├─────────────────────┤
│ id           SERIAL │◄────│ alert_id       FK   │
│ document_name  TEXT │     │ message       TEXT  │
│ document_type  TEXT │     │ channel       TEXT  │
│ expiry_date   DATE  │     │ sent_at  TIMESTAMP  │
│ alert_days     INT  │     │ status       TEXT   │
│ notes         TEXT  │     └─────────────────────┘
│ is_active     BOOL  │
│ created_at    TS    │     ┌─────────────────────┐
└─────────────────────┘     │  uploaded_files     │
                            ├─────────────────────┤
┌─────────────────────┐     │ id           SERIAL │
│  rss_feeds          │     │ original_name TEXT  │
├─────────────────────┤     │ stored_path  TEXT   │
│ id           SERIAL │     │ ocr_text     TEXT   │
│ url          TEXT   │     │ ocr_confidence INT  │
│ name         TEXT   │     └─────────────────────┘
│ category     TEXT   │
│ last_fetched  TS   │     ┌─────────────────────┐
└────────┬────────────┘     │  job_sources        │
         │                  ├─────────────────────┤
┌────────▼────────────┐     │ id           SERIAL │
│  rss_articles       │     │ url          TEXT   │
├─────────────────────┤     │ name         TEXT   │
│ id           SERIAL │     │ css_selector TEXT   │
│ feed_id       FK    │     │ region       TEXT   │
│ title        TEXT   │     │ last_hash    TEXT   │
│ url          TEXT   │     └────────┬────────────┘
│ summary      TEXT   │              │
│ published_at  TS    │     ┌────────▼────────────┐
└─────────────────────┘     │  job_listings       │
                            ├─────────────────────┤
┌─────────────────────┐     │ id           SERIAL │
│  user_status        │     │ source_id     FK    │
├─────────────────────┤     │ title        TEXT   │
│ key          TEXT   │     │ url          TEXT   │
│ value        TEXT   │     │ region       TEXT   │
│ category     TEXT   │     └─────────────────────┘
└─────────────────────┘

┌─────────────────────┐
│  scheduler_log      │
├─────────────────────┤
│ job_name     TEXT   │
│ status       TEXT   │
│ duration_ms  INT    │
│ executed_at   TS    │
└─────────────────────┘
```

## Consumo de Recursos Estimado

| Servicio | RAM | CPU | Disco |
|----------|-----|-----|-------|
| PostgreSQL | ~50MB | Bajo | ~10MB+ |
| Ultra Engine | ~150MB | Bajo | ~50MB |
| **Total** | **~200MB** | **Bajo** | **~60MB** |

> 💡 Antes: ~750MB+ con 8 contenedores. Ahora: ~200MB con 2.
> El CX23 tiene 4GB RAM — sobra el 95% para futuras expansiones.
