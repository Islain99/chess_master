import { Injectable, Logger } from '@nestjs/common';
import {
  GameMode,
  GameResult,
  TimeControlCategory,
} from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * K-factor selon le nombre de parties jouées.
 * Provisoire (< 30 parties) : 40 — rapide convergence.
 * Établi (30-100 parties)   : 20
 * Expérimenté (> 100)       : 10
 */
function kFactor(gamesPlayed: number): number {
  if (gamesPlayed < 30) return 40;
  if (gamesPlayed < 100) return 20;
  return 10;
}

/**
 * Sprint 21 — Série de victoires après une partie : une victoire prolonge la
 * série, une nulle ou une défaite la remet à 0 ; la meilleure série est le
 * maximum atteint.
 */
export function nextStreak(
  previous: { currentStreak: number; bestWinStreak: number } | null,
  actual: number,
): { currentStreak: number; bestWinStreak: number } {
  const currentStreak = actual === 1 ? (previous?.currentStreak ?? 0) + 1 : 0;
  return { currentStreak, bestWinStreak: Math.max(previous?.bestWinStreak ?? 0, currentStreak) };
}

/** Score attendu selon la formule Elo standard. */
function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** Nouveau classement après une partie. */
function newElo(
  current: number,
  opponent: number,
  actual: number,  // 1 = victoire, 0.5 = nulle, 0 = défaite
  k: number,
): number {
  return Math.round(current + k * (actual - expectedScore(current, opponent)));
}

@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Elo courant d'un joueur
  // ──────────────────────────────────────────────

  private readonly eloCache = new Map<string, { elo: number; expiresAt: number }>();

  async getElo(userId: string, timeControl: TimeControlCategory): Promise<number> {
    const key = `${userId}:${timeControl}`;
    const cached = this.eloCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.elo;

    const rating = await this.prisma.rating.findUnique({
      where: { userId_timeControl: { userId, timeControl } },
    });
    const elo = rating?.elo ?? 1200;

    // TTL 60 s (suffisant pour le matchmaking sans cacher un Elo périmé trop longtemps)
    this.eloCache.set(key, { elo, expiresAt: Date.now() + 60_000 });
    return elo;
  }

  /** Invalide le cache d'un joueur (appelé après mise à jour Elo). */
  invalidateEloCache(userId: string): void {
    for (const key of this.eloCache.keys()) {
      if (key.startsWith(`${userId}:`)) this.eloCache.delete(key);
    }
  }

  // ──────────────────────────────────────────────
  // Mise à jour des classements après une partie
  // ──────────────────────────────────────────────

  /**
   * Calcule et persiste les nouveaux Elo des deux joueurs.
   * N'agit que sur les parties en mode MATCHMAKING (parties classées).
   */
  async updateAfterGame(gameId: string): Promise<void> {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
    });

    if (
      !game ||
      !game.result ||
      !game.whitePlayerId ||
      !game.blackPlayerId ||
      game.mode !== GameMode.MATCHMAKING
    ) {
      return;
    }

    const tc = game.timeControl;

    // Elos courants (ou 1200 par défaut)
    const [whiteRating, blackRating, whiteStats, blackStats] = await Promise.all([
      this.prisma.rating.findUnique({
        where: { userId_timeControl: { userId: game.whitePlayerId, timeControl: tc } },
      }),
      this.prisma.rating.findUnique({
        where: { userId_timeControl: { userId: game.blackPlayerId, timeControl: tc } },
      }),
      // Sprint 21 : séries de victoires (lues pour être prolongées ou remises à 0)
      this.prisma.userStatistics.findUnique({ where: { userId: game.whitePlayerId } }),
      this.prisma.userStatistics.findUnique({ where: { userId: game.blackPlayerId } }),
    ]);

    const whiteElo    = whiteRating?.elo ?? 1200;
    const blackElo    = blackRating?.elo ?? 1200;
    const whiteGames  = whiteRating?.gamesPlayed ?? 0;
    const blackGames  = blackRating?.gamesPlayed ?? 0;

    // Score réel (1/0.5/0)
    let whiteActual: number;
    let blackActual: number;

    if (game.result === GameResult.WHITE_WIN) {
      whiteActual = 1; blackActual = 0;
    } else if (game.result === GameResult.BLACK_WIN) {
      whiteActual = 0; blackActual = 1;
    } else {
      whiteActual = 0.5; blackActual = 0.5;
    }

    // Nouveaux Elo
    const wk = kFactor(whiteGames);
    const bk = kFactor(blackGames);
    const newWhiteElo = newElo(whiteElo, blackElo, whiteActual, wk);
    const newBlackElo = newElo(blackElo, whiteElo, blackActual, bk);

    // Persister en transaction
    await this.prisma.$transaction([
      this.prisma.rating.upsert({
        where: { userId_timeControl: { userId: game.whitePlayerId, timeControl: tc } },
        create: {
          userId: game.whitePlayerId,
          timeControl: tc,
          elo:         newWhiteElo,
          peakElo:     newWhiteElo,
          gamesPlayed: 1,
          wins:        whiteActual === 1 ? 1 : 0,
          losses:      whiteActual === 0 ? 1 : 0,
          draws:       whiteActual === 0.5 ? 1 : 0,
        },
        update: {
          elo:         newWhiteElo,
          peakElo:     { set: Math.max(whiteRating?.peakElo ?? 1200, newWhiteElo) },
          gamesPlayed: { increment: 1 },
          wins:        whiteActual === 1     ? { increment: 1 } : undefined,
          losses:      whiteActual === 0     ? { increment: 1 } : undefined,
          draws:       whiteActual === 0.5   ? { increment: 1 } : undefined,
        },
      }),
      this.prisma.rating.upsert({
        where: { userId_timeControl: { userId: game.blackPlayerId, timeControl: tc } },
        create: {
          userId: game.blackPlayerId,
          timeControl: tc,
          elo:         newBlackElo,
          peakElo:     newBlackElo,
          gamesPlayed: 1,
          wins:        blackActual === 1 ? 1 : 0,
          losses:      blackActual === 0 ? 1 : 0,
          draws:       blackActual === 0.5 ? 1 : 0,
        },
        update: {
          elo:         newBlackElo,
          peakElo:     { set: Math.max(blackRating?.peakElo ?? 1200, newBlackElo) },
          gamesPlayed: { increment: 1 },
          wins:        blackActual === 1   ? { increment: 1 } : undefined,
          losses:      blackActual === 0   ? { increment: 1 } : undefined,
          draws:       blackActual === 0.5 ? { increment: 1 } : undefined,
        },
      }),
      this.prisma.userStatistics.upsert({
        where: { userId: game.whitePlayerId },
        create: {
          userId:     game.whitePlayerId,
          totalGames: 1,
          totalWins:    whiteActual === 1 ? 1 : 0,
          totalLosses:  whiteActual === 0 ? 1 : 0,
          totalDraws:   whiteActual === 0.5 ? 1 : 0,
          ...nextStreak(null, whiteActual),
        },
        update: {
          totalGames: { increment: 1 },
          totalWins:    whiteActual === 1   ? { increment: 1 } : undefined,
          totalLosses:  whiteActual === 0   ? { increment: 1 } : undefined,
          totalDraws:   whiteActual === 0.5 ? { increment: 1 } : undefined,
          // Sprint 21 : séries mises à jour (avant : figées après la 1re partie)
          ...nextStreak(whiteStats, whiteActual),
        },
      }),
      this.prisma.userStatistics.upsert({
        where: { userId: game.blackPlayerId },
        create: {
          userId:     game.blackPlayerId,
          totalGames: 1,
          totalWins:    blackActual === 1 ? 1 : 0,
          totalLosses:  blackActual === 0 ? 1 : 0,
          totalDraws:   blackActual === 0.5 ? 1 : 0,
          ...nextStreak(null, blackActual),
        },
        update: {
          totalGames: { increment: 1 },
          totalWins:    blackActual === 1   ? { increment: 1 } : undefined,
          totalLosses:  blackActual === 0   ? { increment: 1 } : undefined,
          totalDraws:   blackActual === 0.5 ? { increment: 1 } : undefined,
          // Sprint 21 : séries mises à jour (avant : figées après la 1re partie)
          ...nextStreak(blackStats, blackActual),
        },
      }),
    ]);

    // Invalider le cache Elo des deux joueurs
    this.invalidateEloCache(game.whitePlayerId);
    this.invalidateEloCache(game.blackPlayerId);

    this.logger.log(
      `Elo mis à jour — blanc: ${whiteElo} → ${newWhiteElo}, ` +
      `noir: ${blackElo} → ${newBlackElo}`,
    );
  }

  // ──────────────────────────────────────────────
  // Utilitaire : calcul pur sans persistance
  // ──────────────────────────────────────────────

  computeEloDelta(
    playerElo: number,
    opponentElo: number,
    actual: 0 | 0.5 | 1,
    gamesPlayed = 50,
  ): number {
    const k = kFactor(gamesPlayed);
    return newElo(playerElo, opponentElo, actual, k) - playerElo;
  }
}
