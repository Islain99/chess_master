// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Environnement des tests end-to-end (chargé avant chaque suite)
//
// Requiert un PostgreSQL et un Redis réels (CI : services du job backend-ci ;
// en local : `docker compose -f infra/docker-compose.yml up -d postgres redis`
// puis `npx prisma db push`). Les tests créent leurs propres comptes, aux
// adresses uniques : ils ne vident ni ne modifient les données existantes.
// ─────────────────────────────────────────────────────────────────────────────
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://chess:chess@localhost:5432/chess';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET ??= 'e2e-secret-e2e-secret-e2e-secret-e2e-secret';
// Des centaines de requêtes depuis 127.0.0.1 : limites relevées pour les tests
process.env.THROTTLE_SHORT_LIMIT ??= '1000';
process.env.THROTTLE_LONG_LIMIT ??= '100000';
// Le moteur Stockfish n'est pas démarré : les parties IA utilisent les niveaux 1-4
process.env.AI_ENGINE_URL ??= 'http://127.0.0.1:9';
