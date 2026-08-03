# ♟ Chess Platform — Jeu d'échecs multiplateforme

Application d'échecs complète : IA niveaux 1-5, multijoueur temps réel, matchmaking Elo, analyse Stockfish.

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
│   ├── k8s/          # Kubernetes manifests
│   └── helm/         # Helm chart chess-platform
├── docs/
│   ├── api-rest-spec.md
│   └── websocket-events.md
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

## Tests

```bash
cd apps/api
npm run test          # 87 tests unitaires
npm run test:e2e      # tests end-to-end (nécessite Postgres)
npm run lint          # ESLint TypeScript
npm run build         # compilation TypeScript
```

## Déploiement production

### Kubernetes (Helm)

```bash
# Staging
helm upgrade chess-staging ./infra/helm/chess-platform \
  --namespace chess-staging --create-namespace \
  --set global.imageTag=sha-abc123 \
  --set secrets.jwtAccessSecret="$JWT_SECRET"

# Production (tag Git)
helm upgrade chess ./infra/helm/chess-platform \
  --namespace chess --create-namespace \
  --set global.imageTag=v1.0.0 \
  --set api.replicas=3
```

### Variables secrètes requises (GitHub Secrets)

| Secret | Description |
|--------|-------------|
| `JWT_ACCESS_SECRET` | Secret JWT access token |
| `JWT_REFRESH_SECRET` | Secret JWT refresh token |
| `DATABASE_URL` | URL PostgreSQL staging |
| `REDIS_URL` | URL Redis staging |
| `KUBE_CONFIG` | Base64 kubeconfig staging |
| `KUBE_CONFIG_PROD` | Base64 kubeconfig production |

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
- **Rate limiting** : 10 req/s et 200 req/min via `@nestjs/throttler`
- **WS** : 20 coups/5 s via `WsRateLimiter`
- **CORS** : origines explicites en production
- **Validation** : `class-validator` + whitelist Prisma côté serveur
- **Anti-cheat** : tous les coups revalidés par chess.js côté serveur

## Licence

MIT — projet pédagogique
