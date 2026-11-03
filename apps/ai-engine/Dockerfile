# ─────────────────────────────────────────────────────────────────────────────
# Microservice IA (Stockfish) — image de production
#
# Sprint 13 :
#   • `npm ci` au lieu de `npm install` : build reproductible via package-lock.json
#   • `prisma generate` ajouté : sans lui, @prisma/client n'exporte pas
#     PrismaClient et le service plantait au démarrage (worker d'analyse).
# Sprint 19 :
#   • exécution en utilisateur non-root `node` (uid 1000)
# Déploiement VPS :
#   • runtime sur Debian (bookworm-slim) : le paquet `stockfish` n'existe plus
#     dans les dépôts Alpine de node:20-alpine (« no such package »). Debian
#     l'installe dans /usr/games ; un lien /usr/bin/stockfish garde le chemin
#     attendu par Compose et Helm. wget sert aux healthchecks.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Étape 1 : compilation TypeScript ────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

# ─── Étape 2 : runtime ───────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS production

# Stockfish (paquet Debian) + OpenSSL requis par le moteur Prisma + wget (healthcheck)
RUN apt-get update \
 && apt-get install -y --no-install-recommends stockfish openssl ca-certificates wget \
 && ln -sf /usr/games/stockfish /usr/bin/stockfish \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV STOCKFISH_PATH=/usr/bin/stockfish

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
