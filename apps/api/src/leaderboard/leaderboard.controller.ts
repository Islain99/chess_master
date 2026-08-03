import { Controller, Get, Query } from '@nestjs/common';
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
    return this.leaderboard.getLeaderboard(
      tc ?? TimeControlCategory.RAPID,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
    );
  }
}
