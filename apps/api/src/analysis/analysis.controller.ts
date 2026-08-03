import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AnalysisService } from './analysis.service';

@Controller('games/:id/analysis')
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  /** POST /games/:id/analysis — lancer l'analyse Stockfish */
  @Post()
  @HttpCode(202)
  request(@Param('id') id: string) {
    return this.analysisService.requestAnalysis(id);
  }

  /** GET /games/:id/analysis — résultats ou statut d'avancement */
  @Get()
  get(@Param('id') id: string) {
    return this.analysisService.getAnalysis(id);
  }
}
