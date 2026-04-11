# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — Telethon sidecar (P1 Lote B B9)          ║
# ║                                                            ║
# ║  Conecta a Telegram MTProto vía Telethon (user session,    ║
# ║  no bot) y stremea mensajes nuevos de canales públicos    ║
# ║  OSINT al engine vía POST /webhooks/telegram-channel.     ║
# ║                                                            ║
# ║  Auth interactivo único:                                   ║
# ║    docker compose run --rm telethon-auth                  ║
# ║                                                            ║
# ║  Operación normal:                                         ║
# ║    docker compose up -d telethon                          ║
# ╚══════════════════════════════════════════════════════════╝
FROM python:3.12-slim

RUN pip install --no-cache-dir \
      "telethon==1.36.0" \
      "httpx==0.27.0"

WORKDIR /app
COPY main.py /app/main.py

# Session file persiste en volume montado en /data
VOLUME ["/data"]

CMD ["python", "main.py", "run"]
