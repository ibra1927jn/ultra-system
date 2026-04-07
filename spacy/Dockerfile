# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — spaCy NER sidecar                        ║
# ║                                                            ║
# ║  Reemplaza/complementa NER de compromise.js para textos   ║
# ║  importantes (high-score articles, opportunities, docs).  ║
# ║                                                            ║
# ║  Modelos: en_core_web_sm + es_core_news_sm (~100MB total) ║
# ║  Endpoints: GET /health, POST /ner {text, lang}           ║
# ╚══════════════════════════════════════════════════════════╝
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
      "fastapi==0.115.0" \
      "uvicorn[standard]==0.32.0" \
      "spacy==3.8.2"

RUN python -m spacy download en_core_web_sm \
 && python -m spacy download es_core_news_sm

WORKDIR /app
COPY app.py /app/app.py

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
