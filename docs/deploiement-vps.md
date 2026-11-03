# Déploiement sur un VPS DigitalOcean

Tout tourne sur un seul Droplet avec Docker Compose (`infra/prod/`). Caddy est
devant et obtient le certificat HTTPS tout seul. Un seul domaine sert tout :

| URL                           | Service                       |
|-------------------------------|-------------------------------|
| `https://DOMAIN/`             | client Web Flutter (Nginx)    |
| `https://DOMAIN/api/v1/...`   | API NestJS                    |
| `https://DOMAIN/socket.io/`   | WebSocket (`/game`, `/lobby`) |

Seuls les ports 22, 80 et 443 sont ouverts. Postgres, Redis, l'API et le
moteur IA ne sont pas joignables depuis Internet.

> Le chart Helm (`infra/helm/`) reste là pour un futur passage à Kubernetes.
> Pour un premier hébergement, un VPS unique coûte bien moins cher et suffit.

## 1. Pousser le code

Le serveur récupère le code depuis GitHub. Commite et pousse d'abord tes
modifications sur `main`.

## 2. Créer le Droplet

Sur DigitalOcean : **Create → Droplets**

- **Image** : Ubuntu 24.04 LTS
- **Région** : Toronto (TOR1), la plus proche de Montréal
- **Taille** : Basic → Regular → **1 vCPU / 2 Go / 50 Go (12 $/mois)**. C'est
  la configuration visée par `infra/prod/`. Le script ajoute 2 Go de swap pour
  la compilation Flutter, et Stockfish est limité à 75 % du processeur pour que
  l'API reste fluide pendant les analyses.
- **Authentification** : **SSH Key** (ajoute ta clé publique ; sous Windows :
  `ssh-keygen -t ed25519` puis le contenu de `~/.ssh/id_ed25519.pub`)
- Option conseillée : cocher **Backups** (sauvegardes du Droplet entier)

Note l'adresse IP du Droplet.

## 3. Nom de domaine

- **Avec un domaine** : crée un enregistrement **A** `chess.tondomaine.com → IP`
  chez ton registraire (ou dans *Networking → Domains* de DigitalOcean).
- **Sans domaine (pour tester)** : utilise `IP-avec-tirets.sslip.io`, par ex.
  `164-90-12-34.sslip.io`. Ce nom pointe déjà vers ton IP et Let's Encrypt
  l'accepte.

## 4. Préparer le serveur (une seule fois)

```bash
ssh root@IP
curl -fsSL https://raw.githubusercontent.com/Islain99/chess_master/main/infra/prod/scripts/setup-server.sh -o setup-server.sh
bash setup-server.sh
exit
```

Le script installe Docker, active le pare-feu, ajoute le swap et crée
l'utilisateur `deploy`. **Ensuite, la connexion `root` par SSH est refusée** :
on se connecte en `deploy`.

## 5. Installer l'application

```bash
ssh deploy@IP
git clone https://github.com/Islain99/chess_master.git
cd chess_master/infra/prod
cp .env.example .env
openssl rand -hex 32   # → POSTGRES_PASSWORD
openssl rand -hex 32   # → JWT_ACCESS_SECRET
nano .env              # DOMAIN, ACME_EMAIL, et les deux secrets ci-dessus
bash scripts/deploy.sh
```

Si le dépôt est privé, `git clone` demande un identifiant : utilise ton nom
GitHub et un *fine-grained personal access token* (lecture seule sur
`chess_master`) comme mot de passe.

La première construction prend 20 à 30 minutes sur 1 vCPU (l'image Flutter est
lourde). Les mises à jour suivantes sont plus rapides grâce au cache Docker.
À la fin, le script affiche `En ligne : https://DOMAIN`.

## 6. Sauvegardes quotidiennes de la base

```bash
(crontab -l 2>/dev/null; echo "15 4 * * * $HOME/chess_master/infra/prod/scripts/backup-db.sh >> $HOME/backups/backup.log 2>&1") | crontab -
```

Les sauvegardes vont dans `~/backups`, gardées 14 jours. Pour en restaurer une,
voir l'en-tête de `scripts/backup-db.sh`.

Ces fichiers restent sur le même serveur. Pour une vraie protection, active
aussi les Backups du Droplet ou copie `~/backups` ailleurs.

## Mettre à jour

Après un `git push` sur `main` :

```bash
ssh deploy@IP 'bash ~/chess_master/infra/prod/scripts/deploy.sh'
```

## Commandes utiles

```bash
cd ~/chess_master/infra/prod
docker compose ps                  # état des services
docker compose logs -f api         # logs de l'API en direct
docker compose logs caddy          # problème de certificat HTTPS
docker compose restart api
docker compose exec postgres psql -U chess chess
```

## Dépannage

- **Le certificat n'est pas émis** : le DNS ne pointe pas encore vers l'IP
  (vérifie avec `nslookup DOMAIN`), ou les ports 80/443 sont bloqués. Caddy
  réessaie tout seul ; regarde `docker compose logs caddy`.
- **`Configuration de production invalide`** dans les logs de l'API :
  `JWT_ACCESS_SECRET` est vide ou fait moins de 32 caractères.
- **Compilation du client tuée (`Killed`, code 137)** : mémoire insuffisante.
  Vérifie le swap (`swapon --show`). En dernier recours, passe temporairement
  le Droplet à 4 Go (*Resize*, CPU et RAM seulement, réversible), compile, puis
  reviens à 2 Go.

## Applications mobiles et bureau

L'URL de l'API est fixée à la compilation. Pour que les apps Android, iOS,
Windows, macOS et Linux utilisent le serveur :

```bash
flutter build apk --release \
  --dart-define=API_URL=https://DOMAIN/api/v1 \
  --dart-define=WS_URL=https://DOMAIN
```

## Connexion Google, Apple, Facebook

Désactivée tant que les variables OAuth sont vides dans `.env`. Pour l'activer,
déclare `https://DOMAIN` comme origine autorisée chez chaque fournisseur, puis
remplis `.env` et relance `deploy.sh`. Le client Web a aussi besoin de ses
propres `--dart-define` (voir `apps/client/lib/core/config/oauth_config.dart`) :
ajoute-les aux `args` du service `client` dans `docker-compose.yml`.
