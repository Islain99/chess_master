import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MoveModule }     from './move/move.module';
import { HealthModule }   from './health/health.module';
import { PrismaModule }   from './prisma/prisma.module';
import { AnalysisModule } from './analysis/analysis.module';

@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').hostname,
        port: parseInt(new URL(process.env.REDIS_URL ?? 'redis://localhost:6379').port || '6379'),
      },
    }),
    PrismaModule,
    HealthModule,
    MoveModule,
    AnalysisModule,
  ],
})
export class AppModule {}
