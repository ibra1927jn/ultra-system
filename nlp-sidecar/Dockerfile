# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — NLP transformers sidecar (B8)            ║
# ║                                                            ║
# ║  Lazy LRU loader (max 2 models in RAM) for:              ║
# ║   - zero-shot classify (distilbart-mnli-12-3)            ║
# ║   - summarization (distilbart-cnn-12-6)                  ║
# ║   - multi-lang sentiment (twitter-xlm-roberta)           ║
# ║   - multi-lang embeddings (paraphrase-MiniLM-L12-v2)     ║
# ║   - any→en translation (opus-mt-mul-en)                  ║
# ║                                                            ║
# ║  Models cached in /models (bind to Hetzner volume).       ║
# ║  Endpoints: /health /classify /summarize /sentiment       ║
# ║             /embed /translate                              ║
# ╚══════════════════════════════════════════════════════════╝
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
    && rm -rf /var/lib/apt/lists/*

# torch CPU wheel index keeps the image ~700MB lighter than the default
# CUDA build, which we don't need on this server.
RUN pip install --no-cache-dir \
      --extra-index-url https://download.pytorch.org/whl/cpu \
      "torch==2.4.1+cpu" \
    && pip install --no-cache-dir \
      "fastapi==0.115.0" \
      "uvicorn[standard]==0.32.0" \
      "transformers==4.45.2" \
      "sentence-transformers==3.2.1" \
      "sentencepiece==0.2.0" \
      "sacremoses==0.1.1" \
      "protobuf==5.28.3"

ENV HF_HOME=/models \
    TRANSFORMERS_CACHE=/models \
    HF_HUB_CACHE=/models \
    SENTENCE_TRANSFORMERS_HOME=/models \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY app.py /app/app.py

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
