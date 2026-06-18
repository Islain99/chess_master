import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /** POST /games — créer une partie (mode LOCAL, AI, PRIVATE, MATCHMAKING) */
  @Post()
  create(@Body() dto: CreateGameDto) {
    return this.gamesService.create(dto);
  }

  /** GET /games/:id — état courant de la partie + coups légaux */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gamesService.findById(id);
  }

  /** POST /games/:id/moves — jouer un coup (validation chess.js côté serveur) */
  @Post(':id/moves')
  makeMove(@Param('id') id: string, @Body() dto: MakeMoveDto) {
    return this.gamesService.makeMove(id, dto);
  }

  /** POST /games/:id/resign — abandonner */
  @Post(':id/resign')
  @HttpCode(200)
  resign(
    @Param('id') id: string,
    @Body() body: { color: 'white' | 'black' },
  ) {
    return this.gamesService.resign(id, body.color ?? 'white');
  }
}
