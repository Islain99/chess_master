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
import { MetricsModule } from './metrics/metrics.module';
import { redisConnection } from './common/redis-connection';

/** Entier positif lu dans l'environnement, sinon la valeur par défaut. */
function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

@Module({
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Limites par IP et par pod. Sprint 20 : ajustables par l'environnement
    // (les tests e2e enchaînent des centaines de requêtes depuis 127.0.0.1).
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000,  limit: envInt('THROTTLE_SHORT_LIMIT', 10)  },  // 10 req/s
      { name: 'long',  ttl: 60000, limit: envInt('THROTTLE_LONG_LIMIT', 300) },  // 300 req/min
    ]),
    BullModule.forRoot({
      // Sprint 19 : mot de passe / base / TLS de REDIS_URL pris en compte
      connection: redisConnection(),
    }),
    MetricsModule, // sprint 19 : /metrics Prometheus
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
