#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Installe la sauvegarde quotidienne de la base (minuteur systemd).
# À lancer UNE fois sur le serveur, en tant que deploy :
#   bash ~/chess_master/infra/prod/scripts/install-backup-timer.sh
#
# Remplace la tâche cron de la première version du guide, qui échouait
# chaque nuit avec « Permission denied » : Git sous Windows enregistre les
# scripts sans droit d'exécution (mode 100644) et cron lançait le fichier
# directement. Le minuteur passe par /bin/bash, donc sans ce droit. Autre
# avantage : Persistent=true rattrape une sauvegarde manquée si le serveur
# était éteint à l'heure prévue.
#
# Si l'ancienne tâche cron est installée, la retirer d'abord : crontab -r
#
# Suivi :
#   systemctl list-timers chess-backup.timer   # prochaine exécution
#   journalctl -u chess-backup --since today   # journal des sauvegardes
#   ls -lh ~/backups                           # fichiers produits
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

RUN_AS=${SUDO_USER:-$(id -un)}
SCRIPT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backup-db.sh"
BACKUP_TIME=${BACKUP_TIME:-04:15}   # heure UTC du serveur

if [[ "$RUN_AS" == "root" ]]; then
  echo "Lance ce script en tant que deploy (pas root)." >&2
  exit 1
fi

sudo tee /etc/systemd/system/chess-backup.service >/dev/null <<UNIT
[Unit]
Description=Sauvegarde PostgreSQL de Chess master
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
User=${RUN_AS}
ExecStart=/bin/bash ${SCRIPT}
UNIT

sudo tee /etc/systemd/system/chess-backup.timer >/dev/null <<UNIT
[Unit]
Description=Sauvegarde quotidienne de Chess master

[Timer]
OnCalendar=*-*-* ${BACKUP_TIME}:00 UTC
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now chess-backup.timer

echo "==> Première sauvegarde immédiate"
sudo systemctl start chess-backup.service
journalctl -u chess-backup -n 3 --no-pager
echo
systemctl list-timers chess-backup.timer --no-pager
