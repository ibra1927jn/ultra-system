# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — HTML article extractor sidecar (B13 lite) ║
# ║                                                            ║
# ║  Pivot from Crawl4AI (4-6GB Playwright/chromium): use     ║
# ║  trafilatura (best-in-class HTML→article extractor, pure  ║
# ║  python ~250MB total). Same goal: extract clean article   ║
# ║  text from sites where rss-parser fails.                  ║
# ║                                                            ║
# ║  Used by engine in the rss.js fallback path (NOT in the   ║
# ║  happy path). Additive — does not replace rss.js.         ║
# ║                                                            ║
# ║  Endpoint:                                                 ║
# ║    POST /extract {url}      → {title,text,author,date,lang,site} ║
# ╚══════════════════════════════════════════════════════════╝
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      "fastapi==0.115.0" \
      "uvicorn[standard]==0.32.0" \
      "httpx==0.27.2" \
      "trafilatura==1.12.2" \
      "lxml==5.3.0"

WORKDIR /app
COPY app.py /app/app.py

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
