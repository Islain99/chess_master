import { Module } from '@nestjs/common';
import { AnalysisModule } from '../analysis/analysis.module';
import { AuthModule } from '../auth/auth.module';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AntiCheatController } from './anti-cheat.controller';
import { AntiCheatService } from './anti-cheat.service';

@Module({
  imports:     [AuthModule, AnalysisModule],
  controllers: [AntiCheatController],
  providers:   [AntiCheatService, AdminGuard],
  exports:     [AntiCheatService],
})
export class AntiCheatModule {}
