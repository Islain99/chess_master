#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Déploiement / mise à jour — à lancer sur le serveur, depuis n'importe où :
#   ~/chess_master/infra/prod/scripts/deploy.sh
#
# Récupère la dernière version de main, reconstruit les images modifiées,
# applique le schéma de base (service « migrate ») et redémarre les services.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROD_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$PROD_DIR/../.." && pwd)"
BRANCH=${BRANCH:-main}

cd "$REPO_DIR"
echo "==> git pull ($BRANCH)"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd "$PROD_DIR"
if [[ ! -f .env ]]; then
  echo "infra/prod/.env introuvable : cp .env.example .env puis remplis-le." >&2
  exit 1
fi
for var in DOMAIN ACME_EMAIL POSTGRES_PASSWORD JWT_ACCESS_SECRET; do
  if ! grep -Eq "^${var}=.+" .env; then
    echo "${var} est vide dans infra/prod/.env" >&2
    exit 1
  fi
done

echo "==> Construction des images (la première fois : 10 à 20 min)"
docker compose build

echo "==> Démarrage"
docker compose up -d --remove-orphans

echo "==> Nettoyage des anciennes images"
docker image prune -f >/dev/null

echo "==> Attente de l'API"
for _ in $(seq 1 30); do
  if docker compose exec -T api wget -qO- http://localhost:3000/api/v1/health/ready >/dev/null 2>&1; then
    echo "API prête."
    docker compose ps
    DOMAIN=$(grep -E '^DOMAIN=' .env | cut -d= -f2-)
    echo
    echo "En ligne : https://${DOMAIN}"
    exit 0
  fi
  sleep 5
done

echo "L'API ne répond pas après 150 s. Logs :" >&2
docker compose logs --tail=80 api migrate >&2
exit 1
