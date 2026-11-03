import { Injectable } from '@nestjs/common';
import { TimeControlCategory } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { parsePage } from '../common/pagination';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaderboard(
    timeControl: TimeControlCategory = TimeControlCategory.RAPID,
    pageInput?: string | number,
    pageSizeInput?: string | number,
  ) {
    // Sprint 21 : pagination bornée (voir common/pagination.ts)
    const { page, pageSize, skip } = parsePage(pageInput, pageSizeInput);

    const [ratings, total] = await this.prisma.$transaction([
      this.prisma.rating.findMany({
        where:   { timeControl },
        orderBy: { elo: 'desc' },
        skip,
        take:    pageSize,
        include: { user: { select: { displayName: true, avatarUrl: true } } },
      }),
      this.prisma.rating.count({ where: { timeControl } }),
    ]);

    return {
      items: ratings.map((r, i) => ({
        rank:        skip + i + 1,
        userId:      r.userId,
        displayName: r.user.displayName,
        avatarUrl:   r.user.avatarUrl,
        elo:         r.elo,
        peakElo:     r.peakElo,
        gamesPlayed: r.gamesPlayed,
        wins:        r.wins,
        losses:      r.losses,
        draws:       r.draws,
        winRate:     r.gamesPlayed > 0
          ? Math.round((r.wins / r.gamesPlayed) * 100)
          : 0,
      })),
      total,
      page,
      pageSize,
      timeControl,
    };
  }
}
