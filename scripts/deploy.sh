#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM - Despliegue                               ║
# ║  Ejecutar: bash scripts/deploy.sh                        ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  🌎 ULTRA SYSTEM — Despliegue                       ║"
echo "║  100% código propio · 0 servicios de terceros       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── 1. Verificar Docker ─────────────────────────────────
echo "1️⃣  Verificando Docker..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker no encontrado. Instala Docker primero."
    exit 1
fi
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose no encontrado."
    exit 1
fi
echo "   ✅ Docker y Docker Compose disponibles"

# ─── 2. Verificar .env ───────────────────────────────────
echo "2️⃣  Verificando configuración..."
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "   ⚠️  No se encontró .env — copiando desde .env.example"
    cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
    echo "   📝 EDITA .env con tus credenciales antes de continuar"
    echo "   Ejecuta: nano $SCRIPT_DIR/.env"
    exit 1
fi

if grep -q "CAMBIA_ESTO" "$SCRIPT_DIR/.env"; then
    echo "   ⚠️  Aún hay valores sin configurar en .env"
    echo "   📝 Busca y cambia todos los 'CAMBIA_ESTO'"
    echo "   Ejecuta: nano $SCRIPT_DIR/.env"
    exit 1
fi
echo "   ✅ Configuración verificada"

# ─── 3. Construir y levantar ─────────────────────────────
echo "3️⃣  Construyendo Ultra Engine..."
cd "$SCRIPT_DIR"
docker compose build --no-cache
echo "   ✅ Imagen construida"

echo "4️⃣  Levantando servicios..."
docker compose up -d
echo "   ✅ Servicios levantados"

# ─── 4. Esperar a que estén listos ───────────────────────
echo "5️⃣  Esperando a que los servicios estén sanos..."
for i in {1..30}; do
    if docker compose ps | grep -q "healthy"; then
        break
    fi
    sleep 2
    printf "   ⏳ Esperando... (%d/30)\r" "$i"
done
echo ""
echo "   ✅ Servicios operativos"

# ─── 5. Mostrar resultado ────────────────────────────────
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ✅ ULTRA SYSTEM DESPLEGADO                          ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
echo "║  🌐 Dashboard: http://${SERVER_IP}                   "
echo "║  📡 API:       http://${SERVER_IP}/api/status        "
echo "║  🤖 Telegram:  Envía /start a tu bot                ║"
echo "║                                                      ║"
echo "║  📦 Contenedores: solo 2 (db + engine)              ║"
echo "║  🧹 Terceros eliminados: 7/7                        ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Comandos útiles:"
echo "  docker compose logs -f engine    # Ver logs del engine"
echo "  docker compose ps                # Ver estado"
echo "  docker compose restart engine    # Reiniciar"
