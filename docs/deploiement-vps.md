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
bash ~/chess_master/infra/prod/scripts/install-backup-timer.sh
```

Le script installe un minuteur systemd et fait tout de suite une première
sauvegarde. Il remplace la tâche cron de la première version de ce guide, qui
échouait avec `Permission denied` (si elle est installée : `crontab -r`). Il en
fait ensuite une chaque jour à 4 h 15 UTC, et rattrape celle qu'il aurait
manquée si le serveur était éteint. Vérifier :

```bash
systemctl list-timers chess-backup.timer   # prochaine exécution
journalctl -u chess-backup --since today   # journal
ls -lh ~/backups
```

Les sauvegardes vont dans `~/backups`, gardées 14 jours. Pour en restaurer une,
voir l'en-tête de `scripts/backup-db.sh`.

Ces fichiers restent sur le même serveur. Pour une vraie protection, active
aussi les Backups du Droplet ou copie `~/backups` ailleurs.

## Domaine, connexions et notifications

À faire dans cet ordre : Google, Facebook et Firebase demandent l'adresse
définitive du site. Les identifiants à copier sont **publics**, sauf l'App
Secret Facebook et le compte de service Firebase, qui ne vont que dans le
`.env` du serveur.

### 1. Nom de domaine

1. Acheter un domaine chez un registraire (Cloudflare, Porkbun, Namecheap… ;
   environ 15 $/an pour un `.com` ou un `.ca`).
2. Dans sa zone DNS, créer un enregistrement **A** : nom `@` (ou `chess` pour
   `chess.mondomaine.com`) → IP du Droplet. Si le registraire propose un
   « proxy » (nuage orange chez Cloudflare), le désactiver : Caddy doit
   obtenir le certificat lui-même.
3. Vérifier depuis ton PC : `nslookup mondomaine.com` doit afficher l'IP.
4. Sur le serveur : remplacer `DOMAIN=` dans `infra/prod/.env`, puis
   `bash scripts/deploy.sh`. Les comptes et parties sont conservés ; l'ancienne
   adresse sslip.io cesse de fonctionner.

Politique de confidentialité (exigée par Google et Facebook) :
`https://DOMAIN/confidentialite.html`. L'adresse de contact affichée est
`CONTACT_EMAIL` (sinon `ACME_EMAIL`) du `.env`.

### 2. Connexion Google

Sur [console.cloud.google.com](https://console.cloud.google.com) :

1. Créer un projet (ex. « Chess master »).
2. *Google Auth Platform* (écran de consentement) : application **Externe**,
   nom, courriel d'assistance, **domaine autorisé** = ton domaine, lien de la
   politique de confidentialité ci-dessus. Champs d'application : `openid`,
   `email`, `profile` uniquement (aucune vérification Google requise).
   Publier l'application (*En production*).
3. *Clients* → **Créer un client** :
   - type **Application Web** : origine JavaScript autorisée `https://DOMAIN` ;
   - type **Android** : package `com.islain99.chess_client` et empreinte SHA-1
     affichée par `tool/build_android.sh` (§ 5).
4. `.env` du serveur : `GOOGLE_WEB_CLIENT_ID` et `GOOGLE_CLIENT_IDS` = l'ID du
   client **Web**. `config/android.json` : `GOOGLE_SERVER_CLIENT_ID` = ce même ID.

### 3. Connexion Facebook

Sur [developers.facebook.com](https://developers.facebook.com) :

1. *Créer une app*, cas d'usage « S'authentifier avec Facebook Login ».
2. *Paramètres > De base* : domaine de l'app = ton domaine ; URL de la
   politique de confidentialité ; URL des **instructions de suppression des
   données** = `https://DOMAIN/confidentialite.html#suppression` ;
   plateforme **Site Web** (`https://DOMAIN/`) ; plateforme **Android** : package
   `com.islain99.chess_client`, classe `com.islain99.chess_client.MainActivity`,
   *key hash* affiché par `tool/build_android.sh`.
3. *Facebook Login > Paramètres* : ajouter `https://DOMAIN` aux domaines
   autorisés pour le SDK JavaScript.
4. Passer l'app en mode **Live** (en mode développement, seuls les comptes
   déclarés comme testeurs peuvent se connecter).
5. `.env` du serveur : `FACEBOOK_APP_ID` et `FACEBOOK_APP_SECRET`.
   `config/android.json` : `FACEBOOK_APP_ID` et `FACEBOOK_CLIENT_TOKEN`
   (*Paramètres > Avancé > Jeton client*).

### 4. Notifications push (Firebase)

Sur [console.firebase.google.com](https://console.firebase.google.com) :

1. *Ajouter un projet* : choisir le projet Google Cloud créé au § 2.
2. Ajouter une application **Web** : copier `apiKey`, `appId`,
   `messagingSenderId`, `projectId` dans le `.env` (`FIREBASE_API_KEY`,
   `FIREBASE_WEB_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_PROJECT_ID`).
3. *Paramètres du projet > Cloud Messaging > Certificats Web Push* : générer
   une paire de clés → `FIREBASE_VAPID_KEY`.
4. *Paramètres du projet > Comptes de service* : *Générer une clé privée*
   (fichier JSON, **secret**). Sur ton PC : `base64 -w0 fichier.json` (Git Bash)
   → `FCM_SERVICE_ACCOUNT`. Supprime ensuite le fichier JSON.
5. Ajouter une application **Android** (package `com.islain99.chess_client`) :
   son `appId` va dans `config/android.json` (`FIREBASE_APP_ID`), avec les
   trois autres valeurs du § 2.

Après les §§ 2 à 4 : `bash scripts/deploy.sh` sur le serveur (le client Web
est recompilé avec les nouveaux identifiants).

### 5. Application Android (APK)

Sur ton PC (Flutter et Android Studio installés), dans `apps/client` :

```bash
cp config/android.example.json config/android.json   # puis le remplir
bash tool/build_android.sh
```

Le script prépare le projet Android (configuration Facebook comprise),
compile `build/app/outputs/flutter-apk/app-release.apk` et affiche l'empreinte
**SHA-1** (Google, § 2) et le **key hash** (Facebook, § 3). Si `keytool`
n'est pas trouvé, il est dans le dossier `jbr/bin` d'Android Studio.

L'APK est signé avec la clé de débogage de ton PC
(`~/.android/debug.keystore`) : compile toujours sur ce PC et sauvegarde ce
fichier, sinon les mises à jour ne s'installeront pas par-dessus l'ancienne
version. Pour l'installer, envoie l'APK sur le téléphone et autorise
l'installation d'applications de source inconnue.

## Compte administrateur (anti-triche)

Les signalements anti-triche (`/admin/cheat-reports`, voir
`docs/api-rest-spec.md`) sont réservés aux administrateurs. Pour nommer le
tien, une fois ton compte créé sur le site :

```bash
cd ~/chess_master/infra/prod
docker compose exec postgres psql -U chess chess \
  -c "UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'toi@exemple.com';"
```

## Mettre à jour

Après un `git push` sur `main`, à la main :

```bash
ssh deploy@IP 'bash ~/chess_master/infra/prod/scripts/deploy.sh'
```

### Déploiement automatique (optionnel)

Le job `deploy-vps` de la CI lance cette même commande à chaque push sur
`main`, une fois les tests backend et Flutter passés. Si un test échoue, rien
n'est déployé. Il reste inactif tant que `VPS_HOST` n'est pas défini.

1. **Créer une clé réservée au déploiement**, sur ton PC (PowerShell) :
   ```powershell
   ssh-keygen -t ed25519 -f chess_deploy -N '""' -C "github-actions"
   ```
   Cela crée `chess_deploy` (clé privée) et `chess_deploy.pub` (clé publique).
2. **Autoriser cette clé sur le serveur** : copie le contenu de
   `chess_deploy.pub` à la fin de `~/.ssh/authorized_keys` de l'utilisateur
   `deploy` :
   ```bash
   nano ~/.ssh/authorized_keys   # coller la ligne, enregistrer
   ```
3. **Récupérer l'empreinte du serveur**, sur ton PC :
   ```powershell
   ssh-keyscan IP
   ```
4. **Dans GitHub** → dépôt → *Settings* → *Secrets and variables* → *Actions* :
   - onglet *Secrets* : `VPS_SSH_KEY` = tout le contenu du fichier
     `chess_deploy` (clé privée, lignes `-----BEGIN` et `-----END` comprises) ;
     `VPS_KNOWN_HOSTS` = la sortie complète de `ssh-keyscan` ;
   - onglet *Variables* : `VPS_HOST` = l'IP du Droplet. Facultatif :
     `VPS_URL` = l'adresse du site, affichée dans l'onglet *Environments*.
5. Supprime les fichiers `chess_deploy` de ton PC une fois la clé copiée dans
   GitHub.

Pour suivre un déploiement : onglet *Actions* du dépôt, job **Deploy → VPS**.
Une mise à jour qui touche le client Flutter prend 15 à 30 minutes.

Les jobs Kubernetes (`deploy-staging`, `deploy-production`) ne tournent que si
la variable `DEPLOY_TARGET` vaut `kubernetes`.

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
