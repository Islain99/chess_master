#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Préparation d'un Droplet Ubuntu 24.04 neuf — à lancer UNE fois, en root :
#   curl -fsSL https://raw.githubusercontent.com/Islain99/chess_master/main/infra/prod/scripts/setup-server.sh | bash
#   (ou : scp ce fichier sur le serveur puis  sudo bash setup-server.sh)
#
# Fait :
#   • mises à jour + mises à jour de sécurité automatiques
#   • utilisateur « deploy » (sudo + docker) avec les mêmes clés SSH que root
#   • SSH : connexion root et mots de passe désactivés
#   • pare-feu UFW : 22, 80, 443 seulement ; fail2ban contre le brute-force SSH
#   • swap de 2 Go (la compilation Flutter Web dépasse 2 Go de RAM)
#   • Docker Engine + plugin Compose (dépôt officiel Docker)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "À lancer en root (sudo bash $0)" >&2
  exit 1
fi

DEPLOY_USER=${DEPLOY_USER:-deploy}
SWAP_SIZE=${SWAP_SIZE:-2G}
export DEBIAN_FRONTEND=noninteractive

echo "==> Mises à jour système"
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Utilisateur ${DEPLOY_USER}"
if ! id "$DEPLOY_USER" &>/dev/null; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"
echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-${DEPLOY_USER}"
chmod 440 "/etc/sudoers.d/90-${DEPLOY_USER}"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/${DEPLOY_USER}/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "/home/${DEPLOY_USER}/.ssh/authorized_keys"
else
  echo "ATTENTION : aucune clé SSH root trouvée — SSH par mot de passe laissé actif." >&2
  NO_KEYS=1
fi

echo "==> Durcissement SSH"
if [[ -z "${NO_KEYS:-}" ]]; then
  cat > /etc/ssh/sshd_config.d/90-hardening.conf <<'CONF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
CONF
  systemctl reload ssh || systemctl reload sshd
fi

echo "==> Pare-feu"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban

echo "==> Swap ${SWAP_SIZE}"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "$SWAP_SIZE" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10
  echo 'vm.swappiness=10' > /etc/sysctl.d/90-swappiness.conf
fi

echo "==> Docker"
if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

echo
echo "Serveur prêt. Reconnecte-toi avec :  ssh ${DEPLOY_USER}@<IP-du-droplet>"
echo "(la connexion root par SSH est désormais refusée)"
