import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { MatchmakingService } from './matchmaking.service';
import { RatingsService } from '../ratings/ratings.service';
import { TimeControlCategory } from '../common/prisma-enums';

@Controller('matchmaking')
@UseGuards(JwtAuthGuard)
export class MatchmakingController {
  constructor(
    private readonly matchmaking: MatchmakingService,
    private readonly ratings: RatingsService,
  ) {}

  /**
   * POST /matchmaking/join — rejoindre la file (REST, sans WS).
   * Retourne le statut ; l'appariement est géré via WebSocket.
   */
  @Post('join')
  @HttpCode(202)
  async join(
    @Req() req: Request,
    @Body() body: { timeControl?: TimeControlCategory },
  ) {
    const user = req.user as RequestUser;
    const tc   = body.timeControl ?? TimeControlCategory.RAPID;
    const elo  = await this.ratings.getElo(user.userId, tc);

    await this.matchmaking.enqueue({
      userId:      user.userId,
      socketId:    'rest', // pas de socket pour les appels REST purs
      elo,
      timeControl: tc,
      queuedAt:    Date.now(),
    });

    return {
      status:      'queued',
      timeControl: tc,
      elo,
      queueSize:   await this.matchmaking.getQueueSize(tc),
    };
  }

  /** DELETE /matchmaking/leave — quitter la file */
  @Delete('leave')
  @HttpCode(204)
  async leave(@Req() req: Request) {
    const user = req.user as RequestUser;
    await this.matchmaking.dequeue(user.userId);
  }

  /** GET /matchmaking/status — statut courant */
  @Get('status')
  async status(@Req() req: Request) {
    const user = req.user as RequestUser;
    return this.matchmaking.getStatus(user.userId);
  }
}
