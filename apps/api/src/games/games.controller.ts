import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { GamesService } from './games.service';
import { CreateGameDto } from './dto/create-game.dto';
import { ImportGameDto } from './dto/import-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  /** POST /games — créer une partie */
  @Post()
  create(@Body() dto: CreateGameDto) {
    return this.gamesService.create(dto);
  }

  /** POST /games/import — importer depuis PGN ou FEN (doit être AVANT :id) */
  @Post('import')
  async importGame(@Body() dto: ImportGameDto) {
    if (dto.fen) return this.gamesService.importFromFen(dto.fen);
    if (dto.pgn) return this.gamesService.importFromPgn(dto.pgn);
    return { error: 'Fournir pgn ou fen.' };
  }

  /** GET /games/:id — état courant + coups légaux */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.gamesService.findById(id);
  }

  /** POST /games/:id/moves — jouer un coup */
  @Post(':id/moves')
  makeMove(@Param('id') id: string, @Body() dto: MakeMoveDto) {
    return this.gamesService.makeMove(id, dto);
  }

  /** POST /games/:id/undo — annuler le dernier coup (mode LOCAL) */
  @Post(':id/undo')
  @HttpCode(200)
  undoMove(@Param('id') id: string) {
    return this.gamesService.undoMove(id);
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

  /** POST /games/:id/draw — nulle par accord */
  @Post(':id/draw')
  @HttpCode(200)
  acceptDraw(@Param('id') id: string) {
    return this.gamesService.acceptDraw(id);
  }

  /** GET /games/:id/pgn — export PGN en texte brut */
  @Get(':id/pgn')
  @Header('Content-Type', 'text/plain; charset=utf-8')
  async getPgn(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pgn = await this.gamesService.getPgn(id);
    res.send(pgn);
  }

  /** GET /games/:id/fen — FEN courant */
  @Get(':id/fen')
  async getFen(@Param('id') id: string) {
    const game = await this.gamesService.findById(id);
    return { fen: game.fen };
  }
}
