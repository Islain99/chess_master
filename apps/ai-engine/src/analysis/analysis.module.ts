import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalysisProcessor, ANALYSIS_QUEUE } from './analysis.processor';
import { StockfishAnalysisService } from './stockfish-analysis.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: ANALYSIS_QUEUE }),
  ],
  providers: [AnalysisProcessor, StockfishAnalysisService],
})
export class AnalysisModule {}
