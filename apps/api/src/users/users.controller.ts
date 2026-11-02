import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GameStatus } from '../common/prisma-enums';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** GET /users/:id — profil public */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id);
  }

  /** GET /users/:id/statistics */
  @Get(':id/statistics')
  @UseGuards(JwtAuthGuard)
  statistics(@Param('id') id: string) {
    return this.usersService.getStatistics(id);
  }

  /** GET /users/:id/ratings */
  @Get(':id/ratings')
  ratings(@Param('id') id: string) {
    return this.usersService.getRatings(id);
  }

  /**
   * GET /users/:id/games?page=&pageSize=&status=ONGOING|FINISHED
   * Sprint 18 : résumés (couleur, issue, adversaire), filtre de statut,
   * pageSize plafonné à 50 (avant : illimité).
   */
  @Get(':id/games')
  @UseGuards(JwtAuthGuard)
  games(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.usersService.getGames(id, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      status:
        status === GameStatus.ONGOING || status === GameStatus.FINISHED ? status : undefined,
    });
  }
}
