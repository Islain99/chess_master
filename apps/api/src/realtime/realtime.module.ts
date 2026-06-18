import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { LobbyGateway } from './lobby.gateway';
import { GamesModule } from '../games/games.module';

@Module({
  imports: [GamesModule],
  providers: [GameGateway, LobbyGateway],
})
export class RealtimeModule {}
