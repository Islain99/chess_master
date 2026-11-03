import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { TimeControlCategory } from '../common/prisma-enums';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboard: LeaderboardService) {}

  /**
   * GET /leaderboard?timeControl=RAPID&page=1&pageSize=20
   * Retourne le classement par Elo pour une cadence donnée.
   */
  @Get()
  getLeaderboard(
    @Query('timeControl') tc?: TimeControlCategory,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    // Sprint 21 : cadence inconnue → 400 (avant : erreur Prisma, 500)
    if (tc !== undefined && !Object.values(TimeControlCategory).includes(tc)) {
      throw new BadRequestException(
        `Cadence inconnue. Valeurs possibles : ${Object.values(TimeControlCategory).join(', ')}.`,
      );
    }
    return this.leaderboard.getLeaderboard(tc ?? TimeControlCategory.RAPID, page, pageSize);
  }
}
