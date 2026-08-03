import { Injectable, Logger } from '@nestjs/common';

/** Niveau Stockfish (0-20) en fonction du classement Elo cible. */
export function eloToSkillLevel(elo: number): number {
  // Elo ~800 → Skill 1, Elo ~3000 → Skill 20
  return Math.max(1, Math.min(20, Math.round((elo - 800) / 110)));
}

/** Temps de réflexion (ms) selon le niveau et la cadence. */
export function computeMoveTime(elo: number): number {
  if (elo < 1000) return 500;
  if (elo < 1500) return 1000;
  if (elo < 2000) return 1500;
  return 2000;
}

/**
 * Client HTTP vers le microservice `apps/ai-engine`.
 * En développement sans Docker, le service peut être indisponible :
 * le GamesService doit alors tomber sur le niveau 4 interne.
 */
@Injectable()
export class StockfishClientService {
  private readonly logger = new Logger(StockfishClientService.name);
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = process.env.AI_ENGINE_URL ?? 'http://localhost:3001';
  }

  /**
   * Demande au microservice ai-engine le meilleur coup UCI pour la position.
   * @param fen        Position FEN
   * @param targetElo  Elo cible (utilisé pour régler le Skill Level Stockfish)
   * @returns          Coup UCI (ex. "e2e4") ou lève une erreur si indisponible
   */
  async getBestMove(fen: string, targetElo: number): Promise<string> {
    const skillLevel = eloToSkillLevel(targetElo);
    const movetime  = computeMoveTime(targetElo);

    const response = await fetch(`${this.baseUrl}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, skillLevel, movetime }),
      signal: AbortSignal.timeout(movetime + 5_000),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`ai-engine error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as { uci: string };
    return data.uci;
  }

  /** Retourne vrai si le service est accessible (healthcheck). */
  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        signal: AbortSignal.timeout(2_000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
