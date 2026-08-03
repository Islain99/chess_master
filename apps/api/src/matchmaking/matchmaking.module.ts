import { Module } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingController } from './matchmaking.controller';
import { RatingsModule } from '../ratings/ratings.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RatingsModule, AuthModule],
  controllers: [MatchmakingController],
  providers: [MatchmakingService],
  exports: [MatchmakingService],
})
export class MatchmakingModule {}
