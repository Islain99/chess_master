#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Sprint 14 — Schéma Prisma unique
//
// Source de vérité : apps/api/prisma/schema.prisma.
// L'ai-engine en garde une copie (son image Docker est construite avec
// apps/ai-engine comme contexte et ne voit pas apps/api), mais cette copie
// ne doit JAMAIS diverger.
//
//   node scripts/sync-schema.js           → vérifie (exécuté par `prebuild`)
//   node scripts/sync-schema.js --write   → recopie le schéma de l'API
//
// Hors du monorepo (build Docker), la source est absente : on ignore.
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const source = path.resolve(__dirname, '../../api/prisma/schema.prisma');
const target = path.resolve(__dirname, '../prisma/schema.prisma');

if (!fs.existsSync(source)) {
  console.log('[schema] apps/api absent (build isolé) : vérification ignorée.');
  process.exit(0);
}

// Comparaison insensible aux fins de ligne (CRLF sous Windows).
const normalize = (s) => s.replace(/\r\n/g, '\n');
const expected = normalize(fs.readFileSync(source, 'utf8'));
const actual = fs.existsSync(target) ? normalize(fs.readFileSync(target, 'utf8')) : '';

if (process.argv.includes('--write')) {
  fs.writeFileSync(target, expected);
  console.log('[schema] prisma/schema.prisma mis à jour depuis apps/api.');
  process.exit(0);
}

if (expected !== actual) {
  console.error(
    '[schema] ✖ apps/ai-engine/prisma/schema.prisma diffère de apps/api/prisma/schema.prisma.\n' +
      '         Lancer : npm run prisma:sync (dans apps/ai-engine), puis committer.',
  );
  process.exit(1);
}
console.log('[schema] ✔ schéma identique à apps/api.');
