/**
 * Shim de compilation : reproduit les enums générés par Prisma.
 * En production, après `npx prisma generate`, importer directement
 * depuis '@prisma/client' à la place de ce fichier.
 *
 * Les valeurs string correspondent exactement aux valeurs
 * définies dans prisma/schema.prisma.
 */

export enum AuthProvider {
  LOCAL = 'LOCAL',
  GOOGLE = 'GOOGLE',
  APPLE = 'APPLE',
  FACEBOOK = 'FACEBOOK',
}

export enum UserRole {
  PLAYER = 'PLAYER',
  ADMIN = 'ADMIN',
}

export enum TimeControlCategory {
  BULLET = 'BULLET',
  BLITZ = 'BLITZ',
  RAPID = 'RAPID',
  CLASSICAL = 'CLASSICAL',
}

export enum PlayerType {
  HUMAN = 'HUMAN',
  AI = 'AI',
}

export enum GameMode {
  LOCAL = 'LOCAL',
  AI = 'AI',
  PRIVATE = 'PRIVATE',
  MATCHMAKING = 'MATCHMAKING',
}

export enum GameStatus {
  WAITING = 'WAITING',
  ONGOING = 'ONGOING',
  FINISHED = 'FINISHED',
  ABORTED = 'ABORTED',
}

export enum GameResult {
  WHITE_WIN = 'WHITE_WIN',
  BLACK_WIN = 'BLACK_WIN',
  DRAW = 'DRAW',
  ABORTED = 'ABORTED',
}

export enum ResultReason {
  CHECKMATE = 'CHECKMATE',
  RESIGNATION = 'RESIGNATION',
  TIMEOUT = 'TIMEOUT',
  DRAW_AGREEMENT = 'DRAW_AGREEMENT',
  STALEMATE = 'STALEMATE',
  THREEFOLD_REPETITION = 'THREEFOLD_REPETITION',
  FIFTY_MOVE_RULE = 'FIFTY_MOVE_RULE',
  INSUFFICIENT_MATERIAL = 'INSUFFICIENT_MATERIAL',
  ABANDONED = 'ABANDONED',
}

export enum Color {
  WHITE = 'WHITE',
  BLACK = 'BLACK',
}

export enum NotificationType {
  GAME_INVITE = 'GAME_INVITE',
  YOUR_TURN = 'YOUR_TURN',
  GAME_ENDED = 'GAME_ENDED',
  SYSTEM = 'SYSTEM',
}

export enum QueueStatus {
  WAITING = 'WAITING',
  MATCHED = 'MATCHED',
  CANCELLED = 'CANCELLED',
}

/** Type minimal reproduisant Prisma.Game pour le typage du service */
export interface PrismaGame {
  id: string;
  mode: GameMode;
  timeControl: TimeControlCategory;
  initialTimeSeconds: number;
  incrementSeconds: number;
  whitePlayerId: string | null;
  whitePlayerType: PlayerType;
  blackPlayerId: string | null;
  blackPlayerType: PlayerType;
  aiLevel: number | null;
  aiTargetElo: number | null;
  status: GameStatus;
  result: GameResult | null;
  resultReason: ResultReason | null;
  initialFen: string;
  currentFen: string;
  pgn: string | null;
  roomCode: string | null;
  whiteTimeRemainingMs: number;
  blackTimeRemainingMs: number;
  createdAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
}
