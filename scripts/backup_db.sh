#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — Backup de PostgreSQL (solo DB)           ║
# ║                                                          ║
# ║  Uso: bash scripts/backup_db.sh                          ║
# ║  Cron: 0 3 * * * /root/vida-control/scripts/backup_db.sh║
# ║                                                          ║
# ║  - Dump PostgreSQL comprimido con gzip                   ║
# ║  - Rotacion automatica: mantiene ultimos 7 dias          ║
# ║  - Compatible con local y produccion                     ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

# PATH explicito para cron
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Directorio de backups: /backups en prod, ./backups en local
if [ -d "/backups" ]; then
    BACKUP_DIR="/backups/db"
else
    BACKUP_DIR="$SCRIPT_DIR/backups/db"
fi

DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7
BACKUP_FILE="$BACKUP_DIR/ultra_db_${DATE}.sql.gz"

echo "[$(date)] Iniciando backup de PostgreSQL..."

# ─── Crear directorio ────────────────────────────────
mkdir -p "$BACKUP_DIR"

# ─── Dump + compresion en un solo paso ───────────────
# pg_dump dentro del contenedor, salida por stdout, gzip local
echo "  Dumping database..."
docker exec ultra_db pg_dump \
    -U "${POSTGRES_USER:-ultra_user}" \
    -d "${POSTGRES_DB:-ultra_db}" \
    --no-owner \
    --no-acl \
    2>/dev/null | gzip > "$BACKUP_FILE"

# Verificar que el archivo no esta vacio
FILESIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null || echo "0")
if [ "$FILESIZE" -lt 100 ]; then
    echo "  ERROR: Backup vacio o demasiado pequeno ($FILESIZE bytes). Abortando."
    rm -f "$BACKUP_FILE"
    exit 1
fi

echo "  OK — $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# ─── Rotacion: eliminar backups de mas de N dias ────
echo "  Rotando backups antiguos (>${RETENTION_DAYS} dias)..."
DELETED=$(find "$BACKUP_DIR" -name "ultra_db_*.sql.gz" -type f -mtime +${RETENTION_DAYS} -print -delete 2>/dev/null | wc -l)
echo "  Eliminados: $DELETED archivos antiguos"

# ─── Resumen ─────────────────────────────────────────
TOTAL_BACKUPS=$(find "$BACKUP_DIR" -name "ultra_db_*.sql.gz" -type f 2>/dev/null | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)

echo ""
echo "  Backup completado"
echo "  Archivo:    $BACKUP_FILE"
echo "  Backups:    $TOTAL_BACKUPS archivos"
echo "  Espacio:    $TOTAL_SIZE"
echo "  Retencion:  $RETENTION_DAYS dias"
echo "[$(date)] Backup finalizado."
