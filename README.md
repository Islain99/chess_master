# ♟ Chess Platform — Jeu d'échecs multiplateforme

Application d'échecs complète : IA niveaux 1-5, multijoueur temps réel, matchmaking Elo, analyse Stockfish.

## Documentation

**[Guide utilisateur](docs/user-guide.md)** · [Architecture (UML)](docs/architecture.md) · [Base de données](docs/database.md) · [API REST](docs/api-rest-spec.md) · [WebSocket](docs/websocket-events.md) · [Déploiement](docs/deployment.md) · [VPS](docs/deploiement-vps.md) · [Tests](docs/testing.md) — index : [docs/README.md](docs/README.md)

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Frontend | Flutter 3 · 6 plateformes (Web, Android, iOS, Windows, macOS, Linux) |
| État client | Riverpod |
| Backend | NestJS 10 · TypeScript · monolithe modulaire |
| Validation coups | chess.js (autorité serveur) |
| Base de données | PostgreSQL 16 via Prisma ORM |
| Cache / files | Redis 7 · BullMQ |
| Temps réel | Socket.IO (namespaces `/game` et `/lobby`) |
| IA niveaux 1-4 | Moteur interne (Negamax, Alpha-Beta, IDS + TT + Null Move) |
| IA niveau 5 | Stockfish via microservice `apps/ai-engine` |
| Auth | JWT (access 15 min + refresh 7 j, rotation, SHA-256 hashing) |
| Sécurité | Helmet, ThrottlerGuard, WsRateLimiter |

## Architecture monorepo

```
chess-platform/
├── apps/
│   ├── api/          # NestJS — API REST + WebSocket
│   ├── ai-engine/    # Microservice Stockfish + worker BullMQ
│   └── client/       # Flutter 6 plateformes
├── infra/
│   ├── docker-compose.yml
│   └── helm/         # Helm chart chess-platform (seule source Kubernetes)
├── docs/             # index : docs/README.md
│   ├── user-guide.md       # guide utilisateur (joueurs)
│   ├── architecture.md     # UML : composants, classes, séquences, états
│   ├── database.md         # modèle entité-association
│   ├── api-rest-spec.md
│   ├── websocket-events.md
│   ├── deployment.md       # Compose, Helm, supervision, CI/CD
│   ├── testing.md          # unitaires, end-to-end, Flutter
│   ├── oauth-setup.md
│   └── push-setup.md
└── .github/workflows/ci.yml
```

## Démarrage local

### Prérequis
- Node.js 20+
- Flutter 3.3+
- Docker + Docker Compose

### Backend

```bash
# Démarrer PostgreSQL + Redis
cd infra && docker compose up postgres redis -d

# API
cd apps/api
cp .env.example .env
npm install
npx prisma generate
npx prisma db push
npm run start:dev      # port 3000

# Microservice IA (dans un autre terminal)
cd apps/ai-engine
npm install
# Requiert stockfish installé : brew install stockfish / apt install stockfish
npm run start:dev      # port 3001
```

### Client Flutter

```bash
cd apps/client
flutter pub get
flutter run -d chrome    # Web
flutter run -d android   # Android
flutter run              # Détection automatique
```

### Tout via Docker

```bash
cd infra && docker compose up --build
```

L'API est disponible sur `http://localhost:3000/api/v1`.

## Variables d'environnement (apps/api/.env)

```env
DATABASE_URL=postgresql://chess:chess@localhost:5432/chess
REDIS_URL=redis://localhost:6379
PORT=3000
CORS_ORIGIN=*
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
AI_ENGINE_URL=http://localhost:3001
```

## Sprints et fonctionnalités

| Sprint | Fonctionnalités |
|--------|-----------------|
| 0 | Squelette monorepo, docker-compose, GitHub Actions CI |
| 1 | chess.js backend · plateau Flutter interactif · mode local |
| 2 | Règles complètes · PGN/FEN · annulation · horloge live |
| 3 | IA niveaux 1-3 (aléatoire, Minimax, Alpha-Beta) |
| 4 | IA niveau 4 (IDS + TT + Null Move) · niveau 5 (Stockfish) |
| 5 | Comptes utilisateurs · JWT · bcryptjs · profil |
| 6 | Multijoueur temps réel · salles privées · déconnexion |
| 7 | Matchmaking Elo · file Redis · classements |
| 8 | Analyse Stockfish BullMQ · notifications · leaderboard |
| 9 | Thèmes plateau · styles pièces · écran Paramètres |
| 10 | Rate limiting HTTP/WS · GlobalExceptionFilter |
| 11 | Kubernetes manifests · Helm chart · CI/CD complet |
| 12 | Tests supplémentaires · cache Elo · stabilisation |
| 13 | Client buildable : bootstrap des 6 plateformes · tests Flutter · CI Flutter · image Docker Web |
| 14 | Client compilable (15 erreurs corrigées) · suppression du code mort · schéma Prisma unique |
| 15 | Connexion Google · Apple · Facebook (échange de jeton vérifié côté serveur) · enums Prisma réels — voir [docs/oauth-setup.md](docs/oauth-setup.md) |
| 16 | Notifications push FCM (Android · iOS · macOS · Web) · génération réelle des notifications (tour, fin de partie, salle) — voir [docs/push-setup.md](docs/push-setup.md) |
| 17 | Sécurité des parties en ligne : jouer / abandonner / accepter la nulle réservé au bon joueur, pendule mesurée par le serveur, Elo à chaque fin de partie classée, forfait réservé aux joueurs |
| 18 | Lecteur de partie + graphique d'évaluation · reprise de partie · « Mes parties » · thèmes de pièces appliqués · profil et avatars · classification des coups (probabilité de gain) |
| 19 | Chart Helm complet (IA, client, Postgres, Redis, secrets, migration, NetworkPolicies) · API multi-réplicas (Socket.IO Redis, nulles et appariement partagés) · métriques Prometheus + alertes + tableau de bord Grafana · CI de déploiement réparée — voir [docs/deployment.md](docs/deployment.md) |
| 20 | Tests : 43 tests end-to-end (HTTP + Socket.IO, partie classée jusqu'au mat, deux réplicas), matchmaking et lobby, widgets Flutter · corrections : détection de vol des refresh tokens, CORS « * », file d'attente à la déconnexion, couleurs et réglages du plateau — voir [docs/testing.md](docs/testing.md) |
| 21 | Documentation : guide utilisateur, architecture UML (composants, classes, séquences, états, déploiement), modèle entité-association, API REST et WebSocket réécrites d'après le code · corrections : couleur du joueur perdue à l'arrivée de l'adversaire, séries de victoires, pagination bornée, erreurs 500 → 400 — voir [docs/](docs/README.md) |

## Tests

Guide complet : **[docs/testing.md](docs/testing.md)**.

```bash
cd apps/client
flutter analyze       # 0 problème
flutter test          # 105 tests unitaires et de widget

cd apps/api
npm run test          # 292 tests unitaires
npm run test:e2e      # 49 tests end-to-end (Postgres + Redis réels, voir le guide)
npm run lint          # ESLint TypeScript
npm run build         # compilation TypeScript
```

## Déploiement production

Guide complet : **[docs/deployment.md](docs/deployment.md)**.

**VPS (DigitalOcean) avec HTTPS** : [docs/deploiement-vps.md](docs/deploiement-vps.md), configuration dans `infra/prod/` (Compose + Caddy).

```bash
# Docker Compose (un serveur)
cd infra && echo "JWT_ACCESS_SECRET=$(openssl rand -hex 32)" > .env
docker compose up --build -d                     # → http://localhost:8080

# Kubernetes (Helm) — secrets générés au premier déploiement puis conservés
helm upgrade --install chess ./infra/helm/chess-platform \
  --namespace chess --create-namespace \
  -f infra/helm/chess-platform/values-production.example.yaml \
  --set global.imageRegistry=ghcr.io/islain99/ \
  --set global.imageTag=v1.0.0 \
  --set ingress.host=chess.mondomaine.com \
  --wait --timeout 10m
```

CI/CD : push sur `main` → staging ; tag `vX.Y.Z` → production. Secrets GitHub requis : `KUBE_CONFIG`, `KUBE_CONFIG_PROD` (les autres sont facultatifs, voir le guide).

## Architecture des niveaux IA

| Niveau | Algorithme | Description |
|--------|-----------|-------------|
| 1 | Aléatoire | Coup légal tiré au hasard |
| 2 | Negamax d=2 | Capture et évite les prises |
| 3 | Alpha-Beta d=4 | Tactique de base |
| 4 | IDS + TT + Null Move | Planification approfondie (1.5 s) |
| 5 | Stockfish UCI | Elo 800-3000 configurable |

## Sécurité

- **JWT** : access tokens 15 min, refresh 7 j avec rotation et détection de fuite
- **Mots de passe** : bcryptjs rounds=10 (→ argon2 en production)
- **Rate limiting** : 10 req/s et 300 req/min via `@nestjs/throttler` (IP réelle derrière l'ingress, `TRUST_PROXY`)
- **Démarrage refusé** en production sans secret JWT solide (≥ 32 caractères)
- **WS** : 20 coups/5 s via `WsRateLimiter`
- **CORS** : origines explicites en production
- **Validation** : `class-validator` + whitelist Prisma côté serveur
- **Anti-cheat** : tous les coups revalidés par chess.js côté serveur

## Licence

MIT — projet pédagogique
