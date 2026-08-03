import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { MoveService } from './move.service';

export class MoveRequestDto {
  fen: string;
  skillLevel: number;   // 1-20 (Stockfish Skill Level)
  movetime: number;     // ms de réflexion
}

@Controller('move')
export class MoveController {
  constructor(private readonly moveService: MoveService) {}

  /**
   * POST /move
   * Retourne le meilleur coup UCI calculé par Stockfish.
   * En cas d'indisponibilité de Stockfish, retourne une erreur 503.
   */
  @Post()
  @HttpCode(200)
  async getBestMove(@Body() dto: MoveRequestDto): Promise<{ uci: string }> {
    const uci = await this.moveService.getBestMove(
      dto.fen,
      dto.skillLevel,
      dto.movetime,
    );
    return { uci };
  }
}
