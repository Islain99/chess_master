import { Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { LobbyGateway } from './lobby.gateway';
import { GamesModule }  from '../games/games.module';
import { RoomsModule }  from '../rooms/rooms.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { RatingsModule }     from '../ratings/ratings.module';
import { AuthModule }        from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [GamesModule, RoomsModule, MatchmakingModule, RatingsModule, AuthModule, NotificationsModule],
  providers: [GameGateway, LobbyGateway],
})
export class RealtimeModule {}
