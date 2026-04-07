# Puppeteer sidecar — desbloquea fuentes SPA que no devuelven RSS/JSON server-side.
# Base oficial: incluye Chromium + dependencias del sistema.
FROM ghcr.io/puppeteer/puppeteer:23.10.4

USER root
WORKDIR /app

# Skip Chromium download — la base image ya lo trae. Punto explícito al
# binario para evitar mismatch de versión entre base image y npm puppeteer.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_CACHE_DIR=/home/pptruser/.cache/puppeteer \
    PUPPETEER_EXECUTABLE_PATH=/home/pptruser/.cache/puppeteer/chrome/linux-131.0.6778.108/chrome-linux64/chrome

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

# Asegura que pptruser puede leer node_modules instalado por root
RUN chown -R pptruser:pptruser /app

USER pptruser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O - http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
