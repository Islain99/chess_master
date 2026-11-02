# ─────────────────────────────────────────────────────────────────────────────
# Microservice IA (Stockfish) — image de production
#
# Sprint 13 :
#   • `npm ci` au lieu de `npm install` : build reproductible via package-lock.json
#   • `prisma generate` ajouté : sans lui, @prisma/client n'exporte pas
#     PrismaClient et le service plantait au démarrage (worker d'analyse).
# ─────────────────────────────────────────────────────────────────────────────

# ─── Étape 1 : compilation TypeScript ────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
RUN npx prisma generate

COPY . .
RUN npm run build

# ─── Étape 2 : runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

# Stockfish (binaire natif Alpine) + OpenSSL requis par le moteur Prisma
RUN apk add --no-cache stockfish openssl

WORKDIR /app
ENV NODE_ENV=production
ENV STOCKFISH_PATH=/usr/bin/stockfish

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
