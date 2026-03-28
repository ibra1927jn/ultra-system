#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — Production Setup Checklist               ║
# ║                                                          ║
# ║  Ejecutar una vez al configurar el servidor:             ║
# ║    bash scripts/setup_production.sh                      ║
# ║                                                          ║
# ║  Verifica env vars, DB, Telegram, migra tablas,          ║
# ║  configura cron de backup e imprime reporte final.       ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0
WARN=0

# ─── Funciones auxiliares ─────────────────────────────
pass() { echo "  [OK]   $1"; PASS=$((PASS + 1)); }
fail() { echo "  [FAIL] $1"; FAIL=$((FAIL + 1)); }
warn() { echo "  [WARN] $1"; WARN=$((WARN + 1)); }

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  ULTRA SYSTEM — Production Setup                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PASO 1: Verificar archivo .env
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "[1/5] Verificando variables de entorno..."

# Cargar .env si existe
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    pass ".env encontrado y cargado"
else
    fail ".env no existe — copiar de .env.example y configurar"
fi

# Variables obligatorias
REQUIRED_VARS=("POSTGRES_USER" "POSTGRES_PASSWORD" "POSTGRES_DB" "TELEGRAM_BOT_TOKEN" "TELEGRAM_CHAT_ID" "API_KEY")
for var in "${REQUIRED_VARS[@]}"; do
    val="${!var:-}"
    if [ -z "$val" ]; then
        fail "$var no configurada"
    elif [[ "$val" == "not_configured" ]] || [[ "$val" == *"CHANGE_IN_PRODUCTION"* ]]; then
        warn "$var tiene valor por defecto — cambiar para produccion"
    else
        pass "$var configurada"
    fi
done

# Verificar que API_KEY no es el placeholder
API_KEY_VAL="${API_KEY:-}"
if [[ "$API_KEY_VAL" == *"CHANGE_IN_PRODUCTION"* ]]; then
    warn "API_KEY es el placeholder del ejemplo. Generar una nueva: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PASO 2: Verificar conexion a PostgreSQL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "[2/5] Verificando conexion a PostgreSQL..."

if docker ps --format '{{.Names}}' | grep -q "ultra_db"; then
    pass "Contenedor ultra_db esta corriendo"

    # Intentar conexion
    if docker exec ultra_db pg_isready -U "${POSTGRES_USER:-ultra_user}" -d "${POSTGRES_DB:-ultra_db}" > /dev/null 2>&1; then
        pass "PostgreSQL acepta conexiones"

        # Contar tablas
        TABLE_COUNT=$(docker exec ultra_db psql -U "${POSTGRES_USER:-ultra_user}" -d "${POSTGRES_DB:-ultra_db}" -tAc \
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo "0")
        TABLE_COUNT=$(echo "$TABLE_COUNT" | tr -d '[:space:]')
        if [ "$TABLE_COUNT" -ge 10 ]; then
            pass "Base de datos tiene $TABLE_COUNT tablas"
        else
            warn "Base de datos tiene $TABLE_COUNT tablas (se esperan >= 15). Ejecutar migracion."
        fi
    else
        fail "PostgreSQL no acepta conexiones"
    fi
else
    fail "Contenedor ultra_db no esta corriendo. Ejecutar: docker compose up -d"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PASO 3: Verificar Telegram bot
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "[3/5] Verificando Telegram bot..."

BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-not_configured}"
CHAT_ID="${TELEGRAM_CHAT_ID:-not_configured}"

if [ "$BOT_TOKEN" = "not_configured" ] || [ -z "$BOT_TOKEN" ]; then
    warn "TELEGRAM_BOT_TOKEN no configurado — alertas deshabilitadas"
else
    # Intentar getMe para verificar el token
    BOT_RESPONSE=$(curl -s --max-time 10 "https://api.telegram.org/bot${BOT_TOKEN}/getMe" 2>/dev/null || echo '{"ok":false}')
    if echo "$BOT_RESPONSE" | grep -q '"ok":true'; then
        BOT_NAME=$(echo "$BOT_RESPONSE" | grep -o '"username":"[^"]*"' | head -1 | cut -d'"' -f4)
        pass "Bot de Telegram activo: @$BOT_NAME"
    else
        fail "Token de Telegram invalido — verificar TELEGRAM_BOT_TOKEN"
    fi

    if [ "$CHAT_ID" = "not_configured" ] || [ -z "$CHAT_ID" ]; then
        warn "TELEGRAM_CHAT_ID no configurado — no se enviaran alertas"
    else
        pass "TELEGRAM_CHAT_ID configurado: $CHAT_ID"
    fi
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PASO 4: Ejecutar migracion de DB
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "[4/5] Ejecutando migracion de base de datos..."

if docker ps --format '{{.Names}}' | grep -q "ultra_engine"; then
    # Ejecutar dentro del contenedor del engine (tiene acceso a la DB via red interna)
    if docker exec ultra_engine node scripts/rebuild_db.js 2>&1; then
        pass "Migracion ejecutada correctamente"
    else
        fail "Error en migracion — revisar logs arriba"
    fi
elif docker ps --format '{{.Names}}' | grep -q "ultra_db"; then
    # Si solo la DB esta corriendo, ejecutar el SQL directamente
    if docker exec -i ultra_db psql -U "${POSTGRES_USER:-ultra_user}" -d "${POSTGRES_DB:-ultra_db}" < "$SCRIPT_DIR/db/init.sql" 2>&1; then
        pass "Migracion ejecutada via init.sql"
    else
        fail "Error en migracion — revisar logs"
    fi
else
    fail "Ningun contenedor corriendo. Ejecutar: docker compose up -d"
fi

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PASO 5: Configurar cron de backup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "[5/5] Configurando backup automatico..."

# Crear directorio de backups
mkdir -p /backups/db 2>/dev/null || mkdir -p "$SCRIPT_DIR/backups/db"

BACKUP_SCRIPT="$SCRIPT_DIR/scripts/backup_db.sh"
CRON_LINE="0 3 * * * $BACKUP_SCRIPT >> /var/log/ultra-backup.log 2>&1"

if command -v crontab > /dev/null 2>&1; then
    # Verificar si ya esta en crontab
    CURRENT_CRON=$(crontab -l 2>/dev/null || true)
    if echo "$CURRENT_CRON" | grep -q "backup_db.sh"; then
        pass "Cron de backup ya configurado"
    else
        # Agregar al crontab sin perder entradas existentes
        (echo "$CURRENT_CRON"; echo "$CRON_LINE") | crontab - 2>/dev/null
        if [ $? -eq 0 ]; then
            pass "Cron de backup agregado: 0 3 * * * (3:00 AM diario)"
        else
            warn "No se pudo agregar cron automaticamente. Agregar manualmente:"
            warn "  crontab -e"
            warn "  $CRON_LINE"
        fi
    fi
else
    warn "crontab no disponible. Agregar backup manualmente en produccion."
fi

# Verificar que el script de backup es ejecutable
chmod +x "$BACKUP_SCRIPT" 2>/dev/null || true
chmod +x "$SCRIPT_DIR/scripts/backup.sh" 2>/dev/null || true

echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  REPORTE FINAL
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  REPORTE FINAL                                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Pasaron:       $PASS"
echo "║  Advertencias:  $WARN"
echo "║  Fallaron:      $FAIL"
echo "╠══════════════════════════════════════════════════════════╣"

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
    echo "║  ESTADO: LISTO PARA PRODUCCION                          ║"
elif [ "$FAIL" -eq 0 ]; then
    echo "║  ESTADO: FUNCIONAL — revisar advertencias               ║"
else
    echo "║  ESTADO: NO LISTO — corregir errores antes de deploy    ║"
fi

echo "╚══════════════════════════════════════════════════════════╝"

# Salir con codigo de error si hubo fallas
if [ "$FAIL" -gt 0 ]; then
    exit 1
fi

exit 0
