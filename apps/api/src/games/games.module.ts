import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { ChessEngineService } from './chess-engine.service';

@Module({
  controllers: [GamesController],
  providers: [GamesService, ChessEngineService],
  exports: [GamesService, ChessEngineService],
})
export class GamesModule {}
