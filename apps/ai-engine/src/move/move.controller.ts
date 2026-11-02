import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { IsInt, IsString, Matches, Max, Min } from 'class-validator';
import { MoveService } from './move.service';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Sprint 19 : décorateurs de validation. Sans eux, le ValidationPipe global
 * (whitelist: true) retirait TOUTES les propriétés du corps — et l'absence du
 * paquet class-validator faisait de toute façon échouer le démarrage.
 */
export class MoveRequestDto {
  /** Position FEN (6 champs séparés par des espaces). */
  @IsString()
  @Matches(/^\S+ [wb] \S+ \S+ \d+ \d+$/, { message: 'FEN invalide' })
  fen: string;

  /** 1-20 (Stockfish Skill Level). */
  @IsInt() @Min(1) @Max(20)
  skillLevel: number;

  /** Temps de réflexion en ms (borné pour protéger le moteur). */
  @IsInt() @Min(10) @Max(30_000)
  movetime: number;
}

@Controller('move')
export class MoveController {
  constructor(
    private readonly moveService: MoveService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * POST /move
   * Retourne le meilleur coup UCI calculé par Stockfish.
   * En cas d'indisponibilité de Stockfish, retourne une erreur 503.
   */
  @Post()
  @HttpCode(200)
  async getBestMove(@Body() dto: MoveRequestDto): Promise<{ uci: string }> {
    // Sprint 19 : latence mesurée (histogramme chess_ai_bestmove_duration_seconds)
    const uci = await this.metrics.timeBestMove(() =>
      this.moveService.getBestMove(dto.fen, dto.skillLevel, dto.movetime),
    );
    return { uci };
  }
}
