import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { GamesModule } from './games/games.module';
import { MatchmakingModule } from './matchmaking/matchmaking.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RoomsModule } from './rooms/rooms.module';
import { RatingsModule } from './ratings/ratings.module';
import { AntiCheatModule } from './anti-cheat/anti-cheat.module';
import { AnalysisModule } from './analysis/analysis.module';
import { LeaderboardModule } from './leaderboard/leaderboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StatisticsModule } from './statistics/statistics.module';

@Module({
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000,  limit: 10  },  // 10 req/s
      { name: 'long',  ttl: 60000, limit: 300 },  // 300 req/min
    ]),
    BullModule.forRoot({
      connection: {
        host: new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname,
        port: parseInt(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port || '6379'),
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    GamesModule,
    MatchmakingModule,
    RoomsModule,
    RatingsModule,
    AntiCheatModule,
    AnalysisModule,
    LeaderboardModule,
    RealtimeModule,
    NotificationsModule,
    StatisticsModule,
  ],
})
export class AppModule {}
