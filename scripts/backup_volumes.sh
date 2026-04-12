#!/bin/bash
# ╔══════════════════════════════════════════════════════════╗
# ║  ULTRA SYSTEM — Backup de volúmenes Docker críticos      ║
# ║                                                          ║
# ║  Uso: bash scripts/backup_volumes.sh                     ║
# ║  Cron: 0 4 * * * /root/ultra-system/scripts/backup_volumes.sh
# ║                                                          ║
# ║  Backups: engine_uploads, telethon_data, changedetection ║
# ║  Rotacion: 7 dias                                        ║
# ╚══════════════════════════════════════════════════════════╝

set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -d "/backups" ]; then
    BACKUP_DIR="/backups/volumes"
else
    BACKUP_DIR="$SCRIPT_DIR/backups/volumes"
fi

DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=7

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting volume backups..."

# List of volumes to backup (name:mount_path_in_container:container)
VOLUMES=(
  "ultra-system_engine_uploads:/app/uploads:ultra_engine"
  "ultra-system_telethon_data:/data:ultra_telethon"
  "ultra-system_changedetection_data:/datastore:ultra_changedetection"
)

TOTAL=0
for entry in "${VOLUMES[@]}"; do
  IFS=':' read -r vol_name mount_path container <<< "$entry"
  OUTFILE="$BACKUP_DIR/${vol_name}_${DATE}.tar.gz"

  # Check container is running
  if ! docker ps -q --filter "name=^${container}$" | grep -q .; then
    echo "  SKIP $vol_name — container $container not running"
    continue
  fi

  echo "  Backing up $vol_name ($mount_path in $container)..."
  docker exec "$container" tar czf - -C "$mount_path" . > "$OUTFILE" 2>/dev/null || {
    # Fallback: use docker run with volume mount if exec fails
    docker run --rm -v "${vol_name}:/backup_src:ro" alpine tar czf - -C /backup_src . > "$OUTFILE" 2>/dev/null
  }

  FSIZE=$(stat -c%s "$OUTFILE" 2>/dev/null || echo "0")
  if [ "$FSIZE" -lt 50 ]; then
    echo "  WARN: $vol_name backup empty ($FSIZE bytes), removing"
    rm -f "$OUTFILE"
  else
    echo "  OK — $(du -h "$OUTFILE" | cut -f1)"
    TOTAL=$((TOTAL + 1))
  fi
done

# Rotation
DELETED=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +${RETENTION_DAYS} -print -delete 2>/dev/null | wc -l)

echo ""
echo "  Volume backups completed: $TOTAL volumes"
echo "  Rotated: $DELETED old archives"
echo "  Total space: $(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)"
echo "[$(date)] Volume backup done."
