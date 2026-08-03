import { Injectable, Logger } from '@nestjs/common';

/**
 * Service de détection anti-triche.
 *
 * Détecte les patterns suspects dans le jeu :
 * - Coups joués trop rapidement (bot possible)
 * - Séquences de coups parfaits sur de nombreux mouvements
 * - Temps de réflexion identiques (bot à timing fixe)
 *
 * Sprint 10 : détection et journalisation.
 * Sprint futur : intégration du système de rapport et de suspension.
 */
@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);

  /** Fenêtre d'analyse (derniers N coups) */
  private readonly WINDOW = 10;

  /** Temps minimum raisonnable par coup en ms (en dessous = suspect) */
  private readonly MIN_MOVE_TIME_MS = 100;

  /** Ratio de coups trop rapides déclenchant une alerte */
  private readonly SPEED_FLAG_RATIO = 0.7;

  /**
   * Analyse les temps de réflexion d'un joueur sur les derniers coups.
   * Retourne un score de suspicion (0-100) et les raisons éventuelles.
   */
  analyzeMoveTimes(moveTimes: number[]): {
    suspicionScore: number;
    flags: string[];
  } {
    if (moveTimes.length < 3) return { suspicionScore: 0, flags: [] };

    const window  = moveTimes.slice(-this.WINDOW);
    const flags:   string[] = [];
    let   score   = 0;

    // 1. Détection de coups ultra-rapides
    const tooFast = window.filter((t) => t < this.MIN_MOVE_TIME_MS).length;
    const fastRatio = tooFast / window.length;
    if (fastRatio >= this.SPEED_FLAG_RATIO) {
      flags.push(`${Math.round(fastRatio * 100)}% des coups joués en < ${this.MIN_MOVE_TIME_MS} ms`);
      score += 40;
    }

    // 2. Timing anormalement uniforme (bot à délai fixe)
    const avg = window.reduce((a, b) => a + b, 0) / window.length;
    const variance = window.reduce((a, b) => a + (b - avg) ** 2, 0) / window.length;
    const stdDev   = Math.sqrt(variance);
    if (avg > 0 && stdDev / avg < 0.05) {
      flags.push(`Timing très uniforme (σ/μ = ${(stdDev / avg).toFixed(3)})`);
      score += 30;
    }

    // 3. Temps médian anormalement bas
    const sorted = [...window].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median < 200) {
      flags.push(`Temps médian de réflexion : ${median} ms`);
      score += 20;
    }

    if (score > 0) {
      this.logger.warn(
        `AntiCheat — score ${score}/100 : ${flags.join(' | ')}`,
      );
    }

    return { suspicionScore: Math.min(100, score), flags };
  }

  /**
   * Valide le timing d'un coup individuel.
   * Retourne false si le timing est manifestement invalide.
   */
  validateMoveTime(timeSpentMs: number, gameMode: string): boolean {
    // En mode IA ou local, pas de contrainte stricte
    if (gameMode !== 'MATCHMAKING') return true;

    // Coup négatif ou impossiblement rapide
    if (timeSpentMs < 0 || timeSpentMs > 60 * 60 * 1_000) return false;

    return true;
  }

  /**
   * Journalise un événement suspect pour révision manuelle.
   */
  logSuspiciousActivity(
    userId: string,
    gameId: string,
    reason: string,
  ): void {
    this.logger.warn(
      `[ANTI-CHEAT] userId=${userId} gameId=${gameId} : ${reason}`,
    );
    // TODO sprint futur : émettre un événement Notification + créer un rapport en BDD
  }
}
