/**
 * Enums Prisma — point d'import unique pour le code applicatif.
 *
 * Sprint 15 : ce fichier était un « shim » qui redéclarait les enums en
 * `enum` TypeScript, faute de pouvoir lancer `prisma generate` dans le bac à
 * sable de développement. Or un `enum` TypeScript est un type NOMINAL :
 * `UserRole.PLAYER` (shim) et `$Enums.UserRole` (client généré) ne sont pas
 * assignables l'un à l'autre, si bien que `npm run build` échouait dès que le
 * vrai client était généré (CI, Docker).
 *
 * On réexporte désormais les enums générés : mêmes noms, mêmes valeurs, et
 * une seule source de vérité (prisma/schema.prisma). Les imports existants
 * (`from '../common/prisma-enums'`) restent valables.
 *
 * Prérequis : `npx prisma generate` (déjà exécuté par la CI et les Dockerfiles).
 */
export {
  AuthProvider,
  UserRole,
  TimeControlCategory,
  PlayerType,
  GameMode,
  GameStatus,
  GameResult,
  ResultReason,
  Color,
  NotificationType,
  QueueStatus,
} from '@prisma/client';

/** Modèle Game généré (utilisé pour typer les conversions dans GamesService). */
export type { Game as PrismaGame } from '@prisma/client';
