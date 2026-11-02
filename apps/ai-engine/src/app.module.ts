import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MoveModule }     from './move/move.module';
import { HealthModule }   from './health/health.module';
import { PrismaModule }   from './prisma/prisma.module';
import { AnalysisModule } from './analysis/analysis.module';
import { MetricsModule }  from './metrics/metrics.module';
import { redisConnection } from './common/redis-connection';

@Module({
  imports: [
    BullModule.forRoot({
      // Sprint 19 : mot de passe / base / TLS de REDIS_URL pris en compte
      connection: redisConnection(),
    }),
    MetricsModule, // sprint 19 : GET /metrics
    PrismaModule,
    HealthModule,
    MoveModule,
    AnalysisModule,
  ],
})
export class AppModule {}
