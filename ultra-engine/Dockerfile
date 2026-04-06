# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA ENGINE — Dockerfile                                ║
# ║  Node.js + Tesseract OCR en una sola imagen              ║
# ╚══════════════════════════════════════════════════════════╝

FROM node:22-alpine

# Instalar Tesseract OCR + idiomas
RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-spa \
    tesseract-ocr-data-eng \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Instalar dependencias Node.js
COPY package.json package-lock.json* ./
RUN npm install --production

# Copiar código fuente
COPY . .

# Crear directorio de uploads
RUN mkdir -p /app/uploads

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

# Iniciar
CMD ["node", "server.js"]
