#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — Fix Puerto 80                            ║
# ║                                                          ║
# ║  Problema: contenedores Docker legacy (n8n, Paperless,   ║
# ║  Miniflux, etc.) siguen ocupando el puerto 80 en el VPS  ║
# ║  Hetzner despues de migrar a ULTRA System.                ║
# ║                                                          ║
# ║  Este script:                                            ║
# ║  1. Lista todos los contenedores (activos y parados)     ║
# ║  2. Identifica los que NO son de ULTRA System             ║
# ║  3. Los detiene y elimina (con confirmacion)              ║
# ║  4. Reinicia ULTRA System limpiamente                     ║
# ║                                                          ║
# ║  Uso: bash scripts/fix_port80.sh                         ║
# ║  Ejecutar en el servidor Hetzner como root.               ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

# Colores para output legible
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Contenedores que pertenecen a ULTRA System (no tocar)
ULTRA_CONTAINERS=("ultra_engine" "ultra_db")

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ULTRA SYSTEM — Fix Puerto 80                        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ─── Paso 1: Listar todos los contenedores ────────────
echo -e "${YELLOW}[1/4] Listando todos los contenedores...${NC}"
echo ""
docker ps -a --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""

# ─── Paso 2: Identificar contenedores en puerto 80 ────
echo -e "${YELLOW}[2/4] Buscando contenedores que usan puerto 80...${NC}"
echo ""

# Obtener contenedores usando puerto 80
PORT80_CONTAINERS=$(docker ps -a --format "{{.Names}}" --filter "publish=80" 2>/dev/null || true)

# Tambien buscar contenedores que puedan estar bloqueando sin --filter
ALL_CONTAINERS=$(docker ps -a --format "{{.Names}}")

# Identificar contenedores que NO son de ULTRA
LEGACY_CONTAINERS=()
for container in $ALL_CONTAINERS; do
    is_ultra=false
    for ultra in "${ULTRA_CONTAINERS[@]}"; do
        if [ "$container" == "$ultra" ]; then
            is_ultra=true
            break
        fi
    done
    if [ "$is_ultra" = false ]; then
        LEGACY_CONTAINERS+=("$container")
    fi
done

if [ ${#LEGACY_CONTAINERS[@]} -eq 0 ]; then
    echo -e "${GREEN}No se encontraron contenedores legacy. Solo ULTRA System presente.${NC}"
    echo ""
    # Verificar si puerto 80 esta libre
    if ss -tlnp | grep -q ":80 "; then
        echo -e "${RED}Puerto 80 sigue ocupado por otro proceso (no Docker):${NC}"
        ss -tlnp | grep ":80 "
        echo ""
        echo "Puede ser Nginx, Apache u otro servicio. Detenerlo manualmente."
        exit 1
    fi
    echo -e "${GREEN}Puerto 80 libre. Reiniciando ULTRA System...${NC}"
else
    echo -e "${RED}Contenedores legacy encontrados:${NC}"
    for c in "${LEGACY_CONTAINERS[@]}"; do
        echo "  - $c"
    done
    echo ""

    # ─── Paso 3: Detener y eliminar contenedores legacy ──
    echo -e "${YELLOW}[3/4] Deteniendo y eliminando contenedores legacy...${NC}"
    echo ""

    for container in "${LEGACY_CONTAINERS[@]}"; do
        echo -n "  Deteniendo $container... "
        docker stop "$container" 2>/dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}ya detenido${NC}"
        echo -n "  Eliminando $container... "
        docker rm "$container" 2>/dev/null && echo -e "${GREEN}OK${NC}" || echo -e "${YELLOW}ya eliminado${NC}"
    done
    echo ""
fi

# ─── Paso 4: Reiniciar ULTRA System ──────────────────
echo -e "${YELLOW}[4/4] Reiniciando ULTRA System...${NC}"
echo ""

# Navegar al directorio del proyecto (ajustar segun ubicacion en Hetzner)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

# Detener ULTRA si esta corriendo (para restart limpio)
docker compose down 2>/dev/null || true

# Levantar ULTRA System
docker compose up -d

echo ""
echo -e "${GREEN}Esperando 10 segundos para que los servicios arranquen...${NC}"
sleep 10

# ─── Verificacion final ──────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Verificacion Final                                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# Verificar que los contenedores ULTRA estan corriendo
for container in "${ULTRA_CONTAINERS[@]}"; do
    STATUS=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null || echo "not found")
    if [ "$STATUS" == "running" ]; then
        echo -e "  ${GREEN}$container: RUNNING${NC}"
    else
        echo -e "  ${RED}$container: $STATUS${NC}"
    fi
done

echo ""

# Verificar puerto 80
if curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health 2>/dev/null | grep -q "200"; then
    echo -e "${GREEN}Puerto 80 respondiendo correctamente.${NC}"
    echo -e "${GREEN}Health check: OK${NC}"
else
    echo -e "${YELLOW}Puerto 80 aun no responde. Revisar logs:${NC}"
    echo "  docker compose logs -f ultra_engine"
fi

echo ""
echo "Contenedores activos:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo ""
