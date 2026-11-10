import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AnalysisService } from '../analysis/analysis.service';
import { GameMode } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Service de détection anti-triche.
 *
 * Sprint 10 : détection des temps de réflexion suspects (journal seulement).
 * Novembre 2026 : branché sur les fins de partie classées.
 *
 *   1. Temps de réflexion — mesurés par le SERVEUR (le client ne peut pas les
 *      falsifier) : coups trop rapides, rythme trop régulier (bot à délai
 *      fixe), médiane anormalement basse.
 *   2. Précision Stockfish — l'analyse de la partie est lancée en arrière-plan ;
 *      le moteur IA crée un signalement si un joueur dépasse le seuil de
 *      précision sur une longue partie (apps/ai-engine, analysis.processor).
 *
 * Un signalement (CheatReport) n'est PAS une sanction : un administrateur le
 * classe (DISMISSED) ou le confirme (CONFIRMED), avec suspension facultative.
 */
export const REPORT_SOURCES = ['TIMING', 'ACCURACY'] as const;
export const REPORT_STATUSES = ['OPEN', 'DISMISSED', 'CONFIRMED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

@Injectable()
export class AntiCheatService {
  private readonly logger = new Logger(AntiCheatService.name);

  /** Fenêtre d'analyse (derniers N coups) */
  private readonly WINDOW = 10;

  /** Temps minimum raisonnable par coup en ms (en dessous = suspect) */
  private readonly MIN_MOVE_TIME_MS = 100;

  /** Ratio de coups trop rapides déclenchant une alerte */
  private readonly SPEED_FLAG_RATIO = 0.7;

  /** Coups minimum d'un joueur pour juger son rythme (bruit sinon). */
  static readonly MIN_MOVES_FOR_TIMING = 10;

  /** Score à partir duquel un signalement est créé. */
  static readonly REPORT_THRESHOLD = 50;

  /** Profondeur de l'analyse Stockfish lancée en arrière-plan. */
  static readonly BACKGROUND_ANALYSIS_DEPTH = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly analysis: AnalysisService,
  ) {}

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

    return { suspicionScore: Math.min(100, score), flags };
  }

  /**
   * Fin d'une partie classée : contrôle des temps de réflexion de chaque
   * joueur, puis analyse Stockfish en arrière-plan (contrôle de précision).
   * Renvoie les signalements créés ou mis à jour.
   */
  async reviewFinishedGame(gameId: string) {
    const game = await this.prisma.game.findUnique({
      where: { id: gameId },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });
    if (!game || game.mode !== GameMode.MATCHMAKING) return [];

    const reports: Array<Awaited<ReturnType<AntiCheatService['report']>>> = [];
    const seats: Array<[string | null, 'WHITE' | 'BLACK']> = [
      [game.whitePlayerId, 'WHITE'],
      [game.blackPlayerId, 'BLACK'],
    ];
    for (const [userId, color] of seats) {
      if (!userId) continue;
      // Le premier coup de chaque camp inclut l'attente du début de partie.
      const times = game.moves
        .filter((m) => m.player === color)
        .slice(1)
        .map((m) => m.timeSpentMs);
      if (times.length < AntiCheatService.MIN_MOVES_FOR_TIMING) continue;

      const { suspicionScore, flags } = this.analyzeMoveTimes(times);
      if (suspicionScore < AntiCheatService.REPORT_THRESHOLD) continue;
      reports.push(await this.report(userId, game.id, 'TIMING', suspicionScore, flags));
    }

    // Le contrôle de précision se fait dans le moteur IA après l'analyse.
    await this.analysis
      .requestAnalysis(game.id, AntiCheatService.BACKGROUND_ANALYSIS_DEPTH)
      .catch((err) => this.logger.warn(`Analyse de fond non lancée pour ${game.id} : ${err}`));

    return reports;
  }

  /** Crée (ou met à jour) le signalement d'un joueur pour une partie. */
  async report(
    userId: string,
    gameId: string,
    source: (typeof REPORT_SOURCES)[number],
    score: number,
    reasons: string[],
  ) {
    this.logger.warn(
      `[ANTI-CHEAT] ${source} userId=${userId} gameId=${gameId} score=${score} : ${reasons.join(' | ')}`,
    );
    return this.prisma.cheatReport.upsert({
      where: { gameId_userId_source: { gameId, userId, source } },
      create: { userId, gameId, source, score, reasons },
      update: { score, reasons },
    });
  }

  // ──────────────────────────────────────────────
  // Administration
  // ──────────────────────────────────────────────

  listReports(status: ReportStatus = 'OPEN') {
    return this.prisma.cheatReport.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { user: { select: { id: true, displayName: true, email: true, isActive: true } } },
    });
  }

  /**
   * Classe ou confirme un signalement. `suspend` (avec CONFIRMED) désactive
   * le compte et révoque ses sessions : connexion et renouvellement refusés.
   */
  async reviewReport(id: string, status: Exclude<ReportStatus, 'OPEN'>, suspend = false) {
    const report = await this.prisma.cheatReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException(`Signalement ${id} introuvable.`);

    const updated = await this.prisma.cheatReport.update({
      where: { id },
      data: { status, reviewedAt: new Date() },
    });
    if (status === 'CONFIRMED' && suspend) {
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: report.userId }, data: { isActive: false } }),
        this.prisma.refreshToken.updateMany({
          where: { userId: report.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
      this.logger.warn(`[ANTI-CHEAT] compte ${report.userId} suspendu (signalement ${id})`);
    }
    return updated;
  }
}
