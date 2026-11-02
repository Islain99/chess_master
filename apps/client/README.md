# Client Flutter — Chess Master

Application Flutter unique pour **Web, Android, iOS, Windows, macOS et Linux**.

## 1. Première installation (une seule fois)

Le dépôt versionne `lib/` et `test/`. Les dossiers plateformes se génèrent avec le script de bootstrap. Ce script :

- ne crée que les dossiers manquants ;
- ne touche jamais à `lib/` ;
- ajoute les permissions réseau nécessaires (Android INTERNET, macOS `network.client`, iOS réseau local).

```powershell
# Windows (PowerShell)
cd apps\client
powershell -ExecutionPolicy Bypass -File tool\bootstrap_platforms.ps1
```

```bash
# macOS / Linux
cd apps/client
bash tool/bootstrap_platforms.sh
```

Ensuite, versionner les dossiers générés :

```bash
git add android ios web windows macos linux
git commit -m "chore(client): add Flutter platform folders"
```

## 2. Lancer l'application

Démarrer d'abord le backend (`docker compose -f infra/docker-compose.yml up postgres redis ai-engine api`), puis :

```bash
flutter pub get
flutter run -d chrome      # Web
flutter run -d windows     # Windows
flutter run -d <emulateur> --dart-define=API_URL=http://10.0.2.2:3000/api/v1 --dart-define=WS_URL=http://10.0.2.2:3000
```

> Sur l'émulateur Android, `localhost` désigne l'émulateur lui-même : il faut utiliser `10.0.2.2` pour joindre la machine hôte.

| Variable | Défaut | Rôle |
|---|---|---|
| `API_URL` | `http://localhost:3000/api/v1` | Base de l'API REST |
| `WS_URL` | `http://localhost:3000` | Serveur Socket.IO |
| `GOOGLE_CLIENT_ID`, `GOOGLE_SERVER_CLIENT_ID` | vide | Connexion Google (sprint 15) |
| `APPLE_SERVICE_ID`, `APPLE_REDIRECT_URI` | vide | Connexion Apple sur Android et le Web |
| `FACEBOOK_APP_ID` | vide | Connexion Facebook sur le Web |

Une variable OAuth vide masque le bouton correspondant. Le guide [docs/oauth-setup.md](../../docs/oauth-setup.md) détaille la configuration des consoles Google, Apple et Meta, ainsi que des projets natifs.

## 3. Qualité

```bash
flutter analyze
flutter test              # tests unitaires et de widget (test/)
flutter test --coverage   # rapport dans coverage/lcov.info
```

## 4. Image Docker (Web)

```bash
docker build -t chess-client \
  --build-arg API_URL=https://chess.example.com/api/v1 \
  --build-arg WS_URL=https://chess.example.com .
docker run -p 8080:80 chess-client   # → http://localhost:8080
```

L'image compile en Flutter Web, puis sert le résultat avec Nginx : routage monopage, gzip, cache long sur les ressources, aucun cache sur `index.html` et le service worker, sonde `/healthz`.

## 5. CI

Le workflow `.github/workflows/ci.yml` exécute :

- `client-ci` : `flutter analyze` et `flutter test` ;
- `client-build` : build des 6 plateformes et artefacts téléchargeables pendant 7 jours ;
- `docker-build` : image `chess-client`.
