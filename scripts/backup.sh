#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM - Backup Automatico                        ║
# ║  Ejecutar: bash scripts/backup.sh                        ║
# ║  Cron: 0 3 * * * /root/vida-control/scripts/backup.sh   ║
# ║                                                          ║
# ║  Compatible con:                                         ║
# ║  - docker-compose.yml (local, backups en ./backups/)     ║
# ║  - docker-compose.prod.yml (prod, backups en /backups/)  ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

# PATH explicito para que funcione desde cron
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Usar /backups si existe (produccion), sino directorio local
if [ -d "/backups" ]; then
    BACKUP_DIR="/backups"
else
    BACKUP_DIR="$SCRIPT_DIR/backups"
fi
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

echo "🔄 [$(date)] Iniciando backup..."

# ─── Crear directorio de backup ───────────────────────
mkdir -p "$BACKUP_DIR"

# ─── Backup de PostgreSQL ─────────────────────────────
echo "📦 Respaldando base de datos..."
docker exec ultra_db pg_dump -U ultra_user -d ultra_db \
    --format=custom \
    --file=/tmp/backup_${DATE}.dump 2>/dev/null

docker cp ultra_db:/tmp/backup_${DATE}.dump "$BACKUP_DIR/db_${DATE}.dump"
docker exec ultra_db rm /tmp/backup_${DATE}.dump

echo "✅ DB respaldada: db_${DATE}.dump"

# ─── Backup de archivos subidos ───────────────────────
echo "📦 Respaldando archivos subidos..."
docker cp ultra_engine:/app/uploads "$BACKUP_DIR/uploads_${DATE}" 2>/dev/null || true
if [ -d "$BACKUP_DIR/uploads_${DATE}" ]; then
    tar -czf "$BACKUP_DIR/uploads_${DATE}.tar.gz" \
        -C "$BACKUP_DIR" "uploads_${DATE}" 2>/dev/null
    rm -rf "$BACKUP_DIR/uploads_${DATE}"
    echo "✅ Uploads respaldados: uploads_${DATE}.tar.gz"
else
    echo "ℹ️  Sin archivos subidos"
fi

# ─── Backup de configuración ──────────────────────────
echo "📦 Respaldando configuración..."
tar -czf "$BACKUP_DIR/config_${DATE}.tar.gz" \
    -C "$SCRIPT_DIR" \
    docker-compose.yml .env db/ 2>/dev/null || true

echo "✅ Config respaldada: config_${DATE}.tar.gz"

# ─── Limpiar backups antiguos ─────────────────────────
echo "🧹 Limpiando backups de más de ${RETENTION_DAYS} días..."
find "$BACKUP_DIR" -type f -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# ─── Resumen ──────────────────────────────────────────
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅ Backup completado               ║"
echo "║  📁 Directorio: $BACKUP_DIR"
echo "║  💾 Tamaño total: $TOTAL_SIZE"
echo "║  🗓️  Retención: ${RETENTION_DAYS} días"
echo "╚══════════════════════════════════════╝"
