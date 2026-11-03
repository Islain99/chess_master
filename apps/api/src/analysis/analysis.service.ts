import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

export const ANALYSIS_QUEUE = 'analysis';

export interface AnalysisJobData {
  gameId: string;
  engineDepth: number;
  moves: Array<{
    ply:      number;
    san:      string;
    uci:      string;
    fenBefore: string;
    fenAfter: string;
    player:   string;
  }>;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);

  constructor(
    @InjectQueue(ANALYSIS_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  // ──────────────────────────────────────────────
  // Soumettre un job d'analyse
  // ──────────────────────────────────────────────

  async requestAnalysis(gameId: string, requestedDepth = 15) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });

    if (!game) throw new NotFoundException(`Partie ${gameId} introuvable.`);
    if (game.status === 'ONGOING') {
      // Sprint 21 : 400 explicite (avant : Error brute → 500)
      throw new BadRequestException('La partie doit être terminée pour être analysée.');
    }

    // Préparer le payload avec les FEN avant/après chaque coup
    const moveData: AnalysisJobData['moves'] = [];
    const INITIAL = game.initialFen;

    for (let i = 0; i < game.moves.length; i++) {
      const m = game.moves[i];
      moveData.push({
        ply:       m.ply,
        san:       m.san,
        uci:       m.uci,
        fenBefore: i === 0 ? INITIAL : game.moves[i - 1].fenAfter,
        fenAfter:  m.fenAfter,
        player:    m.player,
      });
    }

    // Un job terminé ou en échec garde son identifiant dans Redis : on le
    // retire pour permettre une nouvelle tentative.
    const jobId = `analysis-${gameId}`;
    const previous = await this.queue.getJob(jobId);
    if (previous && ((await previous.isFailed()) || (await previous.isCompleted()))) {
      await previous.remove();
    }

    const job = await this.queue.add(
      'analyze',
      { gameId, engineDepth: requestedDepth, moves: moveData } satisfies AnalysisJobData,
      {
        // Sprint 21 : un seul job par partie — demander deux fois l'analyse
        // (double appui, deux appareils) ne lance plus deux calculs Stockfish.
        jobId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    );

    this.logger.log(`Analyse soumise : partie ${gameId}, jobId ${job.id}`);
    return { jobId: job.id, gameId };
  }

  // ──────────────────────────────────────────────
  // Récupérer les résultats d'analyse
  // ──────────────────────────────────────────────

  async getAnalysis(gameId: string) {
    const analysis = await this.prisma.gameAnalysis.findUnique({
      where: { gameId },
    });

    if (!analysis) {
      // Vérifier si un job est en cours
      const waiting = await this.queue.getWaiting();
      const active  = await this.queue.getActive();
      const pending = [...waiting, ...active].find(
        (j) => j.data?.gameId === gameId,
      );

      return {
        status:   pending ? 'processing' : 'not_requested',
        progress: pending ? await pending.progress : 0,
      };
    }

    return {
      status:        'done',
      engineDepth:   analysis.engineDepth,
      accuracyWhite: analysis.accuracyWhite,
      accuracyBlack: analysis.accuracyBlack,
      evaluations:   analysis.evaluations,
    };
  }
}
