import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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

  /** GET /users/:id/games?page=&pageSize= */
  @Get(':id/games')
  @UseGuards(JwtAuthGuard)
  games(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.usersService.getGames(
      id,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
    );
  }
}
