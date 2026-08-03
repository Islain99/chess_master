FROM node:20-alpine AS builder

# Installer Stockfish et ses dépendances
RUN apk add --no-cache stockfish

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM node:20-alpine AS production

# Stockfish dans l'image de production
RUN apk add --no-cache stockfish

WORKDIR /app
ENV NODE_ENV=production
ENV STOCKFISH_PATH=/usr/bin/stockfish

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main.js"]
