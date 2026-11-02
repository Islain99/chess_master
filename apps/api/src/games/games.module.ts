import { Module } from '@nestjs/common';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { drawOfferStoreProvider } from './draw-offer.store';
import { ChessEngineService } from './chess-engine.service';
import { AiEngineService } from './ai/ai-engine.service';
import { StockfishClientService } from './ai/stockfish-client.service';
import { RatingsModule } from '../ratings/ratings.module';

@Module({
  imports: [RatingsModule],
  controllers: [GamesController],
  providers: [GamesService, drawOfferStoreProvider, ChessEngineService, AiEngineService, StockfishClientService],
  exports: [GamesService, ChessEngineService, AiEngineService],
})
export class GamesModule {}
