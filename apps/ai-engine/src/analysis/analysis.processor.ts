import { Logger } from '@nestjs/common';
import { Classification, classifyMove } from './classification';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StockfishAnalysisService } from './stockfish-analysis.service';

export const ANALYSIS_QUEUE = 'analysis';

interface MoveData {
  ply:       number;
  san:       string;
  uci:       string;
  fenBefore: string;
  fenAfter:  string;
  player:    string;
}

interface AnalysisJobData {
  gameId:      string;
  engineDepth: number;
  moves:       MoveData[];
}

// Sprint 18 : classification déplacée dans classification.ts (probabilité de gain).

/**
 * BullMQ Worker — analyse post-partie Stockfish.
 *
 * Pour chaque position, Stockfish calcule :
 *   1. Le meilleur coup et son évaluation (centipions)
 *   2. L'évaluation après le coup joué
 *
 * La différence (eval loss) détermine la classification du coup.
 * Les résultats sont stockés dans la table GameAnalysis.
 */
@Processor(ANALYSIS_QUEUE)
export class AnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalysisProcessor.name);

  constructor(
    private readonly stockfish: StockfishAnalysisService,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job<AnalysisJobData>): Promise<void> {
    const { gameId, engineDepth, moves } = job.data;
    this.logger.log(`Analyse démarrée : partie ${gameId} (${moves.length} coups, d=${engineDepth})`);

    const evaluations: Array<{
      ply:            number;
      san:            string;
      uci:            string;
      evalCp:         number;
      /** Sprint 18 : évaluation du point de vue des blancs (graphique client). */
      evalWhiteCp:    number;
      player:         string;
      bestUci:        string;
      evalLoss:       number;
      classification: Classification;
    }> = [];

    let whiteTotalLoss = 0;
    let blackTotalLoss = 0;
    let whiteMoves = 0;
    let blackMoves = 0;

    for (let i = 0; i < moves.length; i++) {
      const move = moves[i];

      // Progression du job (0-100%)
      await job.updateProgress(Math.round((i / moves.length) * 100));

      // 1. Évaluer la position AVANT le coup → obtenir le meilleur coup
      const beforeAnalysis = await this.stockfish.analyzePosition(
        move.fenBefore,
        engineDepth,
      );

      // 2. Évaluer la position APRÈS le coup joué (pour mesurer l'impact)
      const afterAnalysis = await this.stockfish.analyzePosition(
        move.fenAfter,
        Math.min(engineDepth, 12), // profondeur réduite pour la position après
      );

      // L'évaluation après le coup est du point de vue de l'adversaire → inverser
      const evalAfterFromPlayerPOV = -afterAnalysis.evalCp;

      // Eval loss = ce qu'on aurait obtenu avec le meilleur coup - ce qu'on a obtenu
      const evalLoss = Math.max(
        0,
        beforeAnalysis.evalCp - evalAfterFromPlayerPOV,
      );

      const classification = classifyMove({
        bestEvalCp: beforeAnalysis.evalCp,
        playedEvalCp: evalAfterFromPlayerPOV,
        isBestMove: move.uci === beforeAnalysis.bestUci,
        ply: move.ply,
      });

      evaluations.push({
        ply:            move.ply,
        san:            move.san,
        uci:            move.uci,
        evalCp:         evalAfterFromPlayerPOV,
        evalWhiteCp:    move.player === 'WHITE' ? evalAfterFromPlayerPOV : -evalAfterFromPlayerPOV,
        player:         move.player,
        bestUci:        beforeAnalysis.bestUci,
        evalLoss,
        classification,
      });

      // Accumuler pour le calcul de précision
      if (move.player === 'WHITE') {
        whiteTotalLoss += evalLoss;
        whiteMoves++;
      } else {
        blackTotalLoss += evalLoss;
        blackMoves++;
      }
    }

    // Calculer la précision globale (formule sigmoïde)
    const accuracyWhite = this.computeAccuracy(whiteTotalLoss, whiteMoves);
    const accuracyBlack = this.computeAccuracy(blackTotalLoss, blackMoves);

    // Sauvegarder les résultats dans la BDD
    await this.prisma.gameAnalysis.upsert({
      where: { gameId },
      create: {
        gameId,
        engineDepth,
        accuracyWhite,
        accuracyBlack,
        evaluations: evaluations as unknown as object[],
      },
      update: {
        engineDepth,
        accuracyWhite,
        accuracyBlack,
        evaluations: evaluations as unknown as object[],
      },
    });

    this.logger.log(
      `Analyse terminée : partie ${gameId} — ` +
      `Blancs ${accuracyWhite.toFixed(1)}% / Noirs ${accuracyBlack.toFixed(1)}%`,
    );
  }

  // ──────────────────────────────────────────────
  // Calcul de précision (formule exponentielle)
  // ──────────────────────────────────────────────

  private computeAccuracy(totalLoss: number, numMoves: number): number {
    if (numMoves === 0) return 100;
    const avgLoss = totalLoss / numMoves;
    // Décroissance exponentielle : 0 cp = 100%, 50 cp ≈ 61%, 100 cp ≈ 37%
    return Math.round(Math.max(0, Math.min(100, Math.exp(-avgLoss / 100) * 100)) * 10) / 10;
  }
}
