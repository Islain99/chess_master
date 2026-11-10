import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Chess } from 'chess.js';
import {
  Color,
  GameMode,
  GameResult,
  GameStatus,
  PlayerType,
  PrismaGame,
  ResultReason,
  TimeControlCategory,
} from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  Actor,
  assertCanMove,
  isOnlineGame,
  opposite,
  requirePlayer,
  Seat,
} from './game-access';
import { ChessEngineService } from './chess-engine.service';
import { AiEngineService } from './ai/ai-engine.service';
import { StockfishClientService } from './ai/stockfish-client.service';
import { RatingsService } from '../ratings/ratings.service';
import { CreateGameDto } from './dto/create-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';
import { DRAW_OFFER_STORE, DrawOfferStore, MemoryDrawOfferStore } from './draw-offer.store';

const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const TIME_MS: Record<TimeControlCategory, number> = {
  BULLET:    60_000,
  BLITZ:    300_000,
  RAPID:    600_000,
  CLASSICAL: 1_800_000,
};

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  /**
   * Propositions de nulle en attente (gameId → couleur qui propose).
   * Sprint 19 : stockées dans Redis (partagées entre réplicas) ; repli en
   * mémoire quand aucun store n'est injecté (tests unitaires).
   */
  private readonly drawOffers: DrawOfferStore;

  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ChessEngineService,
    private readonly ai: AiEngineService,
    private readonly stockfishClient: StockfishClientService,
    private readonly ratingsService: RatingsService,
    @Optional() @Inject(DRAW_OFFER_STORE) drawOffers?: DrawOfferStore,
  ) {
    this.drawOffers = drawOffers ?? new MemoryDrawOfferStore();
  }

  // ──────────────────────────────────────────────
  // Création
  // ──────────────────────────────────────────────

  /**
   * Crée une partie LOCAL ou AI.
   * Sprint 18 : une partie contre l'IA créée par un joueur connecté lui est
   * rattachée (blancs) → elle apparaît dans « Mes parties ».
   * Polissage : les parties LOCAL d'un joueur connecté lui sont aussi
   * rattachées (côté blancs, sans adversaire) pour figurer dans son
   * historique. Les règles d'accès ne changent pas (LOCAL / AI restent
   * jouables par l'identifiant de partie) et le classement ne compte que
   * les parties MATCHMAKING.
   */
  async create(dto: CreateGameDto, actor?: Actor) {
    // Sprint 17 : une partie en ligne créée ici n'aurait aucun joueur assigné
    // (donc aucun contrôle d'accès possible) → passer par /rooms ou le matchmaking.
    if (isOnlineGame(dto.mode)) {
      throw new BadRequestException(
        'Les parties en ligne se créent via une salle privée (/rooms) ou le matchmaking.',
      );
    }
    if (dto.mode === GameMode.AI && !dto.aiLevel) {
      throw new BadRequestException('aiLevel est requis pour le mode AI (1–5).');
    }

    const initialMs = TIME_MS[dto.timeControl];

    const game = await this.prisma.game.create({
      data: {
        mode: dto.mode,
        timeControl: dto.timeControl,
        initialTimeSeconds: initialMs / 1000,
        incrementSeconds: 0,
        whitePlayerType: PlayerType.HUMAN,
        blackPlayerType: dto.mode === GameMode.AI ? PlayerType.AI : PlayerType.HUMAN,
        whitePlayerId: actor?.userId,
        aiLevel: dto.aiLevel,
        aiTargetElo: dto.aiTargetElo,
        status: GameStatus.ONGOING,
        startedAt: new Date(),
        whiteTimeRemainingMs: initialMs,
        blackTimeRemainingMs: initialMs,
        initialFen: INITIAL_FEN,
        currentFen: INITIAL_FEN,
      },
    });

    const legalMoves = this.engine.getStatus(INITIAL_FEN).legalMoves;
    return this.toResponse(game, [], legalMoves);
  }

  // ──────────────────────────────────────────────
  // Lecture
  // ──────────────────────────────────────────────

  async findById(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });

    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);

    const legalMoves =
      game.status === GameStatus.ONGOING
        ? this.engine.getStatus(game.currentFen).legalMoves
        : [];

    return this.toResponse(game, game.moves, legalMoves);
  }

  // ──────────────────────────────────────────────
  // Export PGN
  // ──────────────────────────────────────────────

  async getPgn(id: string): Promise<string> {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });
    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);
    return this.buildPgn(game as PrismaGame, game.moves);
  }

  // ──────────────────────────────────────────────
  // Coup (joueur humain)
  // ──────────────────────────────────────────────

  /**
   * Joue un coup. `actor` : auteur authentifié (obligatoire en ligne).
   * Sprint 17 : en ligne, seul le joueur au trait peut jouer, et le temps
   * consommé est mesuré par le serveur (la valeur du client est ignorée).
   */
  async makeMove(id: string, dto: MakeMoveDto, actor?: Actor) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });

    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);
    if (game.status !== GameStatus.ONGOING) {
      throw new BadRequestException('Cette partie est terminée.');
    }

    const online = isOnlineGame(game.mode);
    if (online) assertCanMove(game, actor);

    const moveResult = this.engine.applyMove(game.currentFen, dto.uci);
    if (!moveResult.valid) {
      throw new UnprocessableEntityException({
        error: 'ILLEGAL_MOVE',
        message: `Le coup ${dto.uci} est illégal dans la position actuelle.`,
      });
    }

    const activeColor = this.engine.activeColor(game.currentFen);
    const timeSpentMs = online
      ? this.serverElapsedMs(game.moves.at(-1)?.createdAt ?? game.startedAt)
      : dto.timeSpentMs ?? 0;

    let newWhiteMs =
      activeColor === 'w'
        ? Math.max(0, game.whiteTimeRemainingMs - timeSpentMs)
        : game.whiteTimeRemainingMs;
    let newBlackMs =
      activeColor === 'b'
        ? Math.max(0, game.blackTimeRemainingMs - timeSpentMs)
        : game.blackTimeRemainingMs;

    const ply = game.moves.length + 1;
    const fenAfter = moveResult.fenAfter!;
    const status = this.engine.getStatus(fenAfter);

    let { newGameStatus, result, reason } = this.resolveGameEnd(
      status, newWhiteMs, newBlackMs,
    );

    // Un coup joué met fin à toute proposition de nulle en cours.
    await this.clearDrawOffer(id);

    const [move, _upd] = await this.prisma.$transaction([
      this.prisma.move.create({
        data: {
          gameId: id,
          ply,
          player: activeColor === 'w' ? Color.WHITE : Color.BLACK,
          san: moveResult.san!,
          uci: dto.uci,
          fenAfter,
          isCheck: moveResult.isCheck ?? false,
          isCheckmate: moveResult.isCheckmate ?? false,
          isCapture: moveResult.isCapture ?? false,
          isPromotion: moveResult.isPromotion ?? false,
          promotionPiece: moveResult.promotionPiece ?? null,
          timeSpentMs,
          clockRemainingMs: activeColor === 'w' ? newWhiteMs : newBlackMs,
        },
      }),
      this.prisma.game.update({
        where: { id },
        data: {
          currentFen: fenAfter,
          whiteTimeRemainingMs: newWhiteMs,
          blackTimeRemainingMs: newBlackMs,
          status: newGameStatus,
          result: result ?? undefined,
          resultReason: reason ?? undefined,
          endedAt: newGameStatus === GameStatus.FINISHED ? new Date() : undefined,
        },
        include: { moves: { orderBy: { ply: 'asc' } } },
      }),
    ]);

    const playerMoveData = {
      ply,
      san: move.san,
      uci: move.uci,
      fenAfter,
      isCheck: move.isCheck,
      isCheckmate: move.isCheckmate,
      isCapture: move.isCapture,
    };

    // ─── Réponse IA ──────────────────────────────────────────────────────────

    let aiMoveData: any = null;

    if (game.mode === GameMode.AI && newGameStatus === GameStatus.ONGOING) {
      const aiResult = await this.applyAiMove(
        id, fenAfter, game.aiLevel ?? 1, game.aiTargetElo,
        newWhiteMs, newBlackMs, ply + 1,
      );

      if (aiResult) {
        aiMoveData = aiResult.move;
        newGameStatus = aiResult.status;
        result = aiResult.result;
        reason = aiResult.reason;
        newWhiteMs = aiResult.white;
        newBlackMs = aiResult.black;
      }
    }

    // Déclencher la mise à jour des classements (fire-and-forget)
    if (newGameStatus === GameStatus.FINISHED && game.mode === GameMode.MATCHMAKING) {
      this.ratingsService.updateAfterGame(id).catch((err) =>
        this.logger.warn(`Mise à jour Elo échouée pour ${id} : ${err}`),
      );
    }

    return {
      move: playerMoveData,
      aiMove: aiMoveData,
      game: {
        status: newGameStatus,
        result,
        resultReason: reason,
        fen: aiMoveData ? aiMoveData.fenAfter : fenAfter,
        clocks: { white: newWhiteMs, black: newBlackMs },
        legalMoves:
          newGameStatus === GameStatus.ONGOING
            ? (aiMoveData
                ? this.engine.getStatus(aiMoveData.fenAfter).legalMoves
                : status.legalMoves)
            : [],
      },
    };
  }

  // ──────────────────────────────────────────────
  // Coup IA (interne)
  // ──────────────────────────────────────────────

  private async applyAiMove(
    gameId: string,
    fen: string,
    aiLevel: number,
    aiTargetElo: number | null,
    whiteMs: number,
    blackMs: number,
    ply: number,
  ) {
    // Sélection du coup selon le niveau
    let uci: string;

    if (aiLevel >= 5) {
      // Niveau 5 : Stockfish via microservice ai-engine
      try {
        const targetElo = aiTargetElo ?? 1500;
        uci = await this.stockfishClient.getBestMove(fen, targetElo);
      } catch (err) {
        // Fallback sur le niveau 4 si le service est indisponible
        this.logger.warn(`Stockfish indisponible, repli sur niveau 4 : ${err}`);
        uci = this.ai.getBestMove(fen, 4);
      }
    } else {
      uci = this.ai.getBestMove(fen, aiLevel);
    }

    const aiResult = this.engine.applyMove(fen, uci);
    if (!aiResult.valid) return null;

    const fenAfter = aiResult.fenAfter!;
    const status = this.engine.getStatus(fenAfter);
    const aiColor = this.engine.activeColor(fen);
    const { newGameStatus, result, reason } = this.resolveGameEnd(status, whiteMs, blackMs);

    const [aiMove] = await this.prisma.$transaction([
      this.prisma.move.create({
        data: {
          gameId,
          ply,
          player: aiColor === 'w' ? Color.WHITE : Color.BLACK,
          san: aiResult.san!,
          uci,
          fenAfter,
          isCheck: aiResult.isCheck ?? false,
          isCheckmate: aiResult.isCheckmate ?? false,
          isCapture: aiResult.isCapture ?? false,
          isPromotion: aiResult.isPromotion ?? false,
          promotionPiece: aiResult.promotionPiece ?? null,
          timeSpentMs: 0,
          clockRemainingMs: aiColor === 'w' ? whiteMs : blackMs,
        },
      }),
      this.prisma.game.update({
        where: { id: gameId },
        data: {
          currentFen: fenAfter,
          status: newGameStatus,
          result: result ?? undefined,
          resultReason: reason ?? undefined,
          endedAt: newGameStatus === GameStatus.FINISHED ? new Date() : undefined,
        },
      }),
    ]);

    return {
      move: {
        ply, san: aiMove.san, uci, fenAfter,
        isCheck: aiMove.isCheck, isCheckmate: aiMove.isCheckmate, isCapture: aiMove.isCapture,
      },
      status: newGameStatus, result, reason,
      white: whiteMs, black: blackMs,
    };
  }

  // ──────────────────────────────────────────────
  // Annulation du dernier coup (mode LOCAL)
  // ──────────────────────────────────────────────

  async undoMove(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });

    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);
    if (game.status !== GameStatus.ONGOING) {
      throw new BadRequestException('Impossible d\'annuler le coup d\'une partie terminée.');
    }
    if (game.mode !== GameMode.LOCAL) {
      throw new BadRequestException('L\'annulation n\'est disponible qu\'en mode local.');
    }
    if (game.moves.length === 0) {
      throw new BadRequestException('Aucun coup à annuler.');
    }

    const lastMove = game.moves[game.moves.length - 1];
    const prevFen =
      game.moves.length > 1
        ? game.moves[game.moves.length - 2].fenAfter
        : game.initialFen;

    await this.prisma.$transaction([
      this.prisma.move.delete({ where: { id: lastMove.id } }),
      this.prisma.game.update({ where: { id }, data: { currentFen: prevFen } }),
    ]);

    const updated = await this.prisma.game.findUnique({
      where: { id },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });

    return this.toResponse(
      updated! as PrismaGame,
      updated!.moves,
      this.engine.getStatus(prevFen).legalMoves,
    );
  }

  // ──────────────────────────────────────────────
  // Abandon
  // ──────────────────────────────────────────────

  /**
   * Abandon. En ligne, la couleur qui abandonne est celle de l'acteur : la
   * valeur `color` fournie par le client est ignorée (sprint 17).
   * `reason` : ABANDONED pour un forfait après déconnexion (acteur système).
   */
  async resign(
    id: string,
    color: Seat,
    actor?: Actor,
    reason: ResultReason = ResultReason.RESIGNATION,
  ) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);
    if (game.status !== GameStatus.ONGOING) {
      throw new BadRequestException('Cette partie est déjà terminée.');
    }

    const loser: Seat =
      isOnlineGame(game.mode) && !actor?.system ? requirePlayer(game, actor) : color;
    const result = loser === 'white' ? GameResult.BLACK_WIN : GameResult.WHITE_WIN;

    const ended = await this.prisma.game.update({
      where: { id },
      data: {
        status: GameStatus.FINISHED,
        result,
        resultReason: reason,
        endedAt: new Date(),
      },
    });
    this.afterGameEnded(ended);
    return ended;
  }

  // ──────────────────────────────────────────────
  // Nulle par accord
  // ──────────────────────────────────────────────

  /**
   * Sprint 17 — Proposition de nulle (parties en ligne). Renvoie la couleur
   * qui propose, pour que la gateway prévienne l'adversaire.
   */
  async offerDraw(id: string, actor?: Actor): Promise<Seat> {
    const game = await this.findOngoing(id);
    if (!isOnlineGame(game.mode)) {
      throw new BadRequestException('La proposition de nulle concerne les parties en ligne.');
    }
    const seat = requirePlayer(game, actor);
    await this.drawOffers.set(id, seat);
    return seat;
  }

  /** Sprint 17 — Refus d'une nulle proposée par l'adversaire. */
  async declineDraw(id: string, actor?: Actor): Promise<void> {
    const game = await this.findOngoing(id);
    if (!isOnlineGame(game.mode)) return;
    const seat = requirePlayer(game, actor);
    await this.consumeDrawOffer(id, seat);
  }

  /**
   * Nulle par accord. En ligne : uniquement en réponse à une proposition de
   * l'ADVERSAIRE (sprint 17). Parties locales : immédiate, comme avant.
   */
  async acceptDraw(id: string, actor?: Actor) {
    const game = await this.findOngoing(id);

    if (isOnlineGame(game.mode)) {
      await this.consumeDrawOffer(id, requirePlayer(game, actor));
    }

    const ended = await this.prisma.game.update({
      where: { id },
      data: {
        status: GameStatus.FINISHED,
        result: GameResult.DRAW,
        resultReason: ResultReason.DRAW_AGREEMENT,
        endedAt: new Date(),
      },
    });
    this.afterGameEnded(ended);
    return ended;
  }

  // ──────────────────────────────────────────────
  // Helpers sprint 17
  // ──────────────────────────────────────────────

  private async findOngoing(id: string) {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);
    if (game.status !== GameStatus.ONGOING) {
      throw new BadRequestException('Cette partie est déjà terminée.');
    }
    return game;
  }

  /** Vérifie et retire la proposition de nulle faite par l'adversaire de `seat`. */
  private async consumeDrawOffer(id: string, seat: Seat) {
    if ((await this.drawOffers.get(id)) !== opposite(seat)) {
      throw new ConflictException({
        error: 'NO_DRAW_OFFER',
        message: 'Votre adversaire ne vous a pas proposé la nulle.',
      });
    }
    await this.drawOffers.delete(id);
  }

  /**
   * Retire une éventuelle proposition sans jamais faire échouer l'appelant :
   * une panne Redis ne doit pas bloquer un coup ou une fin de partie (la clé
   * expirera d'elle-même).
   */
  private async clearDrawOffer(id: string) {
    try {
      await this.drawOffers.delete(id);
    } catch (err) {
      this.logger.warn(`Nettoyage de la proposition de nulle ${id} impossible : ${err}`);
    }
  }

  /** Temps écoulé depuis le dernier coup (ou le début), mesuré par le serveur. */
  private serverElapsedMs(since: Date | null): number {
    return since ? Math.max(0, Date.now() - since.getTime()) : 0;
  }

  /**
   * Fin de partie hors coup (abandon, nulle, forfait) : nettoyage et Elo.
   * Avant le sprint 17, l'Elo n'était recalculé que sur mat/pat/temps :
   * abandonner une partie classée ne coûtait aucun point.
   */
  private afterGameEnded(game: { id: string; mode: GameMode }) {
    void this.clearDrawOffer(game.id);
    if (game.mode === GameMode.MATCHMAKING) {
      this.ratingsService.updateAfterGame(game.id).catch((err) =>
        this.logger.warn(`Mise à jour Elo échouée pour ${game.id} : ${err}`),
      );
    }
  }

  // ──────────────────────────────────────────────
  // Import depuis FEN
  // ──────────────────────────────────────────────

  async importFromFen(fen: string) {
    if (!this.engine.validateFen(fen)) {
      throw new BadRequestException('FEN invalide.');
    }

    const game = await this.prisma.game.create({
      data: {
        mode: GameMode.LOCAL,
        timeControl: TimeControlCategory.RAPID,
        initialTimeSeconds: 600,
        incrementSeconds: 0,
        whitePlayerType: PlayerType.HUMAN,
        blackPlayerType: PlayerType.HUMAN,
        status: GameStatus.ONGOING,
        startedAt: new Date(),
        whiteTimeRemainingMs: 600_000,
        blackTimeRemainingMs: 600_000,
        initialFen: fen,
        currentFen: fen,
      },
    });

    return this.toResponse(game, [], this.engine.getStatus(fen).legalMoves);
  }

  // ──────────────────────────────────────────────
  // Import depuis PGN
  // ──────────────────────────────────────────────

  async importFromPgn(pgn: string) {
    const chess = new Chess();
    try { chess.loadPgn(pgn); } catch {
      throw new BadRequestException('PGN invalide ou coups illégaux.');
    }

    const history = chess.history({ verbose: true });
    const finalFen = chess.fen();
    const isOver = chess.isGameOver();

    let gameStatus: GameStatus = GameStatus.ONGOING;
    let result: GameResult | null = null;
    let reason: ResultReason | null = null;

    if (isOver) {
      gameStatus = GameStatus.FINISHED;
      if (chess.isCheckmate()) {
        result = chess.turn() === 'w' ? GameResult.BLACK_WIN : GameResult.WHITE_WIN;
        reason = ResultReason.CHECKMATE;
      } else if (chess.isDraw()) {
        result = GameResult.DRAW;
        reason = chess.isStalemate()             ? ResultReason.STALEMATE
               : chess.isThreefoldRepetition()   ? ResultReason.THREEFOLD_REPETITION
               : chess.isInsufficientMaterial()   ? ResultReason.INSUFFICIENT_MATERIAL
               :                                   ResultReason.FIFTY_MOVE_RULE;
      }
    }

    const game = await this.prisma.game.create({
      data: {
        mode: GameMode.LOCAL,
        timeControl: TimeControlCategory.CLASSICAL,
        initialTimeSeconds: 1800,
        incrementSeconds: 0,
        whitePlayerType: PlayerType.HUMAN,
        blackPlayerType: PlayerType.HUMAN,
        status: gameStatus,
        result: result ?? undefined,
        resultReason: reason ?? undefined,
        startedAt: new Date(),
        endedAt: isOver ? new Date() : undefined,
        whiteTimeRemainingMs: 1_800_000,
        blackTimeRemainingMs: 1_800_000,
        initialFen: INITIAL_FEN,
        currentFen: finalFen,
        pgn,
      },
    });

    const replay = new Chess(INITIAL_FEN);
    for (let i = 0; i < history.length; i++) {
      const m = history[i];
      replay.move(m.san);
      await this.prisma.move.create({
        data: {
          gameId: game.id,
          ply: i + 1,
          player: i % 2 === 0 ? Color.WHITE : Color.BLACK,
          san: m.san,
          uci: `${m.from}${m.to}${m.promotion ?? ''}`,
          fenAfter: replay.fen(),
          isCheck: replay.inCheck(),
          isCheckmate: replay.isCheckmate(),
          isCapture: m.captured !== undefined,
          isPromotion: m.promotion !== undefined,
          promotionPiece: m.promotion ?? null,
          timeSpentMs: 0,
          clockRemainingMs: 1_800_000,
        },
      });
    }

    const savedMoves = await this.prisma.move.findMany({
      where: { gameId: game.id },
      orderBy: { ply: 'asc' },
    });

    return this.toResponse(game, savedMoves, []);
  }

  // ──────────────────────────────────────────────
  // Helpers privés
  // ──────────────────────────────────────────────

  private resolveGameEnd(
    status: ReturnType<ChessEngineService['getStatus']>,
    whiteMs: number,
    blackMs: number,
  ) {
    let newGameStatus: GameStatus = GameStatus.ONGOING;
    let result: GameResult | null = null;
    let reason: ResultReason | null = null;

    if (whiteMs === 0) {
      newGameStatus = GameStatus.FINISHED;
      result = GameResult.BLACK_WIN; reason = ResultReason.TIMEOUT;
    } else if (blackMs === 0) {
      newGameStatus = GameStatus.FINISHED;
      result = GameResult.WHITE_WIN; reason = ResultReason.TIMEOUT;
    } else if (status.isOver) {
      newGameStatus = GameStatus.FINISHED;
      if (status.isCheckmate) {
        result = status.winner === 'w' ? GameResult.WHITE_WIN : GameResult.BLACK_WIN;
        reason = ResultReason.CHECKMATE;
      } else if (status.isStalemate) {
        result = GameResult.DRAW; reason = ResultReason.STALEMATE;
      } else if (status.isThreefoldRepetition) {
        result = GameResult.DRAW; reason = ResultReason.THREEFOLD_REPETITION;
      } else if (status.isInsufficientMaterial) {
        result = GameResult.DRAW; reason = ResultReason.INSUFFICIENT_MATERIAL;
      } else if (status.is50MoveRule) {
        result = GameResult.DRAW; reason = ResultReason.FIFTY_MOVE_RULE;
      }
    }

    return { newGameStatus, result, reason };
  }

  private toResponse(game: PrismaGame, moves: any[], legalMoves: string[]) {
    return {
      id: game.id,
      mode: game.mode,
      timeControl: game.timeControl,
      aiLevel: game.aiLevel,
      // Infos multijoueur : permet au client de déterminer sa couleur
      whitePlayerId: game.whitePlayerId,
      blackPlayerId: game.blackPlayerId,
      roomCode:      game.roomCode,
      status:        game.status,
      result:        game.result,
      resultReason:  game.resultReason,
      fen:           game.currentFen,
      initialFen:    game.initialFen,
      clocks: {
        white: game.whiteTimeRemainingMs,
        black: game.blackTimeRemainingMs,
      },
      legalMoves,
      moves: moves.map((m) => ({
        ply: m.ply, san: m.san, uci: m.uci,
        fenAfter: m.fenAfter, isCheck: m.isCheck,
        isCheckmate: m.isCheckmate, isCapture: m.isCapture,
      })),
    };
  }

  private buildPgn(game: PrismaGame, moves: any[]): string {
    const date = game.startedAt
      ? game.startedAt.toISOString().split('T')[0].replace(/-/g, '.')
      : '????.??.??';
    const resultStr = this.enumResultToPgn(game.result);

    const headers = [
      `[Event "Partie locale"]`,
      `[Site "chess-platform"]`,
      `[Date "${date}"]`,
      `[Round "?"]`,
      `[White "Blancs"]`,
      `[Black "Noirs"]`,
      `[Result "${resultStr}"]`,
      `[TimeControl "${game.initialTimeSeconds}"]`,
    ].join('\n');

    let movesStr = '';
    for (const m of moves) {
      const num = Math.ceil(m.ply / 2);
      movesStr += m.player === Color.WHITE ? `${num}. ${m.san} ` : `${m.san} `;
    }

    return `${headers}\n\n${movesStr.trim()} ${resultStr}`;
  }

  private enumResultToPgn(result: GameResult | null): string {
    switch (result) {
      case GameResult.WHITE_WIN: return '1-0';
      case GameResult.BLACK_WIN: return '0-1';
      case GameResult.DRAW:      return '1/2-1/2';
      default:                   return '*';
    }
  }
}
