#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Sauvegarde PostgreSQL quotidienne, conservée 14 jours.
# Planification : install-backup-timer.sh (minuteur systemd, 04 h 15 UTC).
# Lancement manuel possible : bash backup-db.sh
#
# Restaurer une sauvegarde :
#   gunzip -c ~/backups/chess-AAAAMMJJ-HHMM.sql.gz | \
#     docker compose -f ~/chess_master/infra/prod/docker-compose.yml exec -T postgres psql -U chess chess
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR=${BACKUP_DIR:-$HOME/backups}
KEEP_DAYS=${KEEP_DAYS:-14}

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/chess-$(date +%Y%m%d-%H%M).sql.gz"

cd "$PROD_DIR"
docker compose exec -T postgres pg_dump -U chess --clean --if-exists chess | gzip > "$FILE"
find "$BACKUP_DIR" -name 'chess-*.sql.gz' -mtime +"$KEEP_DAYS" -delete

echo "$(date -Is) sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
