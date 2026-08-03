import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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

  async getGames(userId: string, page = 1, pageSize = 20) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.game.findMany({
        where: {
          OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.game.count({
        where: {
          OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
        },
      }),
    ]);

    return { items, total, page, pageSize };
  }

  private toPublic(user: any) {
    return {
      id:          user.id,
      email:       user.email,
      displayName: user.displayName,
      avatarUrl:   user.avatarUrl ?? null,
      country:     user.country ?? null,
      role:        user.role,
      authProvider: user.authProvider,
      createdAt:   user.createdAt,
    };
  }
}
