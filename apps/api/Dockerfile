# ─────────────────────────────────────────────────────────────────────────────
# API NestJS — image de production
#
# Sprint 19 :
#   • `npm ci` (build reproductible via package-lock.json) au lieu de `npm install`
#   • `prisma` est désormais une dépendance de production : avant, `npx prisma
#     generate` dans l'image finale téléchargeait la DERNIÈRE version de Prisma
#     (incompatible avec @prisma/client 5.x). Le CLI sert aussi au Job de
#     migration du chart Helm (`npm run db:push`).
#   • OpenSSL installé (requis par le moteur Prisma sur Alpine)
#   • exécution en utilisateur non-root `node` (uid 1000)
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
FROM node:20-alpine AS production
RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force

COPY --from=builder /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
