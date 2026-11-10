import { Injectable, NotFoundException } from '@nestjs/common';
import { GameStatus } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Profil PUBLIC (GET /users/:id, accessible sans authentification).
   * Sprint 18 : l'e-mail et le fournisseur de connexion n'y figurent plus —
   * les identifiants de joueurs étant visibles dans chaque partie, n'importe
   * qui pouvait récupérer l'adresse de n'importe quel joueur.
   */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return this.toPublic(user);
  }

  async getStatistics(userId: string) {
    const stats = await this.prisma.userStatistics.findUnique({
      where: { userId },
    });

    if (!stats) {
      // Retourner des stats vides si le joueur n'en a pas encore
      return {
        totalGames: 0, totalWins: 0, totalLosses: 0, totalDraws: 0,
        currentStreak: 0, bestWinStreak: 0,
      };
    }

    return {
      totalGames:    stats.totalGames,
      totalWins:     stats.totalWins,
      totalLosses:   stats.totalLosses,
      totalDraws:    stats.totalDraws,
      currentStreak: stats.currentStreak,
      bestWinStreak: stats.bestWinStreak,
    };
  }

  async getRatings(userId: string) {
    return this.prisma.rating.findMany({ where: { userId } });
  }

  /**
   * Sprint 18 — Historique des parties d'un joueur, du plus récent au plus ancien.
   * Chaque entrée est un résumé « du point de vue du joueur » : sa couleur,
   * l'issue pour lui et son adversaire (compte, IA ou aucun en local).
   */
  async getGames(
    userId: string,
    options: { page?: number; pageSize?: number; status?: GameStatus } = {},
  ) {
    const page = clamp(options.page ?? 1, 1, 10_000);
    const pageSize = clamp(options.pageSize ?? 20, 1, MAX_PAGE_SIZE);
    const where = {
      OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
      ...(options.status ? { status: options.status } : {}),
    };
    const playerSelect = { select: { id: true, displayName: true, avatarUrl: true } };

    const [games, total] = await this.prisma.$transaction([
      this.prisma.game.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          whitePlayer: playerSelect,
          blackPlayer: playerSelect,
          _count: { select: { moves: true } },
        },
      }),
      this.prisma.game.count({ where }),
    ]);

    return { items: games.map((g) => toGameSummary(g, userId)), total, page, pageSize };
  }

  private toPublic(user: any) {
    return {
      id:          user.id,
      displayName: user.displayName,
      avatarUrl:   user.avatarUrl ?? null,
      country:     user.country ?? null,
      role:        user.role,
      createdAt:   user.createdAt,
    };
  }
}

// ─── Historique : résumé d'une partie (sprint 18) ────────────────────────────

export const MAX_PAGE_SIZE = 50;

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : min;
}

type PlayerRef = { id: string; displayName: string; avatarUrl: string | null } | null;

interface GameRow {
  id: string;
  mode: string;
  timeControl: string;
  status: string;
  result: string | null;
  resultReason: string | null;
  aiLevel: number | null;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  whitePlayer: PlayerRef;
  blackPlayer: PlayerRef;
  createdAt: Date;
  endedAt: Date | null;
  _count: { moves: number };
}

export function toGameSummary(game: GameRow, userId: string) {
  const color: 'white' | 'black' = game.blackPlayerId === userId ? 'black' : 'white';
  const opponent = color === 'white' ? game.blackPlayer : game.whitePlayer;

  // Partie locale : les deux camps sont joués sur le même appareil, une
  // « victoire » du créateur n'a pas de sens → pas d'issue (le client
  // affiche le résultat blanc / noir).
  let outcome: 'win' | 'loss' | 'draw' | null = null;
  if (game.mode === 'LOCAL') outcome = null;
  else if (game.result === 'DRAW') outcome = 'draw';
  else if (game.result === 'WHITE_WIN') outcome = color === 'white' ? 'win' : 'loss';
  else if (game.result === 'BLACK_WIN') outcome = color === 'black' ? 'win' : 'loss';

  return {
    id: game.id,
    mode: game.mode,
    timeControl: game.timeControl,
    status: game.status,
    result: game.result,
    resultReason: game.resultReason,
    color,
    outcome,
    opponent: opponent
      ? { type: 'user' as const, id: opponent.id, displayName: opponent.displayName, avatarUrl: opponent.avatarUrl }
      : game.mode === 'AI'
        ? { type: 'ai' as const, level: game.aiLevel }
        : null,
    moveCount: game._count.moves,
    createdAt: game.createdAt,
    endedAt: game.endedAt,
  };
}
