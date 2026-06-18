# Chess platform — monorepo

Jeu d'échecs multiplateforme (Flutter) avec IA (Stockfish + moteur interne) et multijoueur temps réel (NestJS + Socket.IO).

## Structure

- `apps/api` — backend NestJS (monolithe modulaire), Prisma/PostgreSQL, Socket.IO.
- `apps/ai-engine` — service IA isolé (sera initialisé au sprint 4).
- `apps/client` — application Flutter, 6 plateformes (sera initialisée au sprint 1).
- `infra` — docker-compose, Helm charts, manifests Kubernetes.
- `docs` — architecture, spécifications API REST, catalogue WebSocket.

## Démarrage local (sprint 0)

```bash
cd apps/api
cp .env.example .env
npm install
npx prisma generate
cd ../../infra
docker compose up --build
```

L'API expose un healthcheck sur `GET /api/v1/health`.
