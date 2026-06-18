import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  Color,

  GameMode,
  GameResult,
  GameStatus,
  PlayerType,
  ResultReason,
  TimeControlCategory,
  PrismaGame,
} from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { ChessEngineService } from './chess-engine.service';
import { CreateGameDto } from './dto/create-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';

const INITIAL_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Temps initial en ms selon la cadence */
const TIME_MS: Record<TimeControlCategory, number> = {
  BULLET: 60_000,
  BLITZ: 300_000,
  RAPID: 600_000,
  CLASSICAL: 1_800_000,
};

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly engine: ChessEngineService,
  ) {}

  // ──────────────────────────────────────────────
  // Création
  // ──────────────────────────────────────────────

  async create(dto: CreateGameDto) {
    if (dto.mode === GameMode.AI && !dto.aiLevel) {
      throw new BadRequestException(
        'aiLevel est requis pour le mode AI (1–5).',
      );
    }

    const initialMs = TIME_MS[dto.timeControl];

    const game = await this.prisma.game.create({
      data: {
        mode: dto.mode,
        timeControl: dto.timeControl,
        initialTimeSeconds: initialMs / 1000,
        incrementSeconds: 0,
        whitePlayerType: PlayerType.HUMAN,
        blackPlayerType:
          dto.mode === GameMode.AI ? PlayerType.AI : PlayerType.HUMAN,
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
  // Coup
  // ──────────────────────────────────────────────

  async makeMove(id: string, dto: MakeMoveDto) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: { moves: { orderBy: { ply: 'asc' } } },
    });

    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);
    if (game.status !== GameStatus.ONGOING) {
      throw new BadRequestException('Cette partie est terminée.');
    }

    // Valider et appliquer le coup via chess.js (autorité côté serveur)
    const moveResult = this.engine.applyMove(game.currentFen, dto.uci);
    if (!moveResult.valid) {
      throw new UnprocessableEntityException({
        error: 'ILLEGAL_MOVE',
        message: `Le coup ${dto.uci} est illégal dans la position actuelle.`,
      });
    }

    // Déduire le temps de l'horloge du joueur courant
    const activeColor = this.engine.activeColor(game.currentFen);
    const timeSpentMs = dto.timeSpentMs ?? 0;

    const newWhiteMs =
      activeColor === 'w'
        ? Math.max(0, game.whiteTimeRemainingMs - timeSpentMs)
        : game.whiteTimeRemainingMs;
    const newBlackMs =
      activeColor === 'b'
        ? Math.max(0, game.blackTimeRemainingMs - timeSpentMs)
        : game.blackTimeRemainingMs;

    const ply = game.moves.length + 1;
    const fenAfter = moveResult.fenAfter!;

    // Analyser le statut de la nouvelle position
    const status = this.engine.getStatus(fenAfter);

    // Déterminer si la partie est terminée
    let newGameStatus = GameStatus.ONGOING;
    let result: GameResult | null = null;
    let reason: ResultReason | null = null;

    if (newWhiteMs === 0) {
      newGameStatus = GameStatus.FINISHED;
      result = GameResult.BLACK_WIN;
      reason = ResultReason.TIMEOUT;
    } else if (newBlackMs === 0) {
      newGameStatus = GameStatus.FINISHED;
      result = GameResult.WHITE_WIN;
      reason = ResultReason.TIMEOUT;
    } else if (status.isOver) {
      newGameStatus = GameStatus.FINISHED;
      if (status.isCheckmate) {
        result = status.winner === 'w' ? GameResult.WHITE_WIN : GameResult.BLACK_WIN;
        reason = ResultReason.CHECKMATE;
      } else if (status.isStalemate) {
        result = GameResult.DRAW;
        reason = ResultReason.STALEMATE;
      } else if (status.isThreefoldRepetition) {
        result = GameResult.DRAW;
        reason = ResultReason.THREEFOLD_REPETITION;
      } else if (status.isInsufficientMaterial) {
        result = GameResult.DRAW;
        reason = ResultReason.INSUFFICIENT_MATERIAL;
      } else if (status.is50MoveRule) {
        result = GameResult.DRAW;
        reason = ResultReason.FIFTY_MOVE_RULE;
      }
    }

    // Persister le coup et mettre à jour la partie en une transaction
    const [move, _updatedGame] = await this.prisma.$transaction([
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

    return {
      move: {
        ply,
        san: move.san,
        uci: move.uci,
        fenAfter,
        isCheck: move.isCheck,
        isCheckmate: move.isCheckmate,
        isCapture: move.isCapture,
      },
      game: {
        status: newGameStatus,
        result,
        resultReason: reason,
        fen: fenAfter,
        clocks: { white: newWhiteMs, black: newBlackMs },
        legalMoves: newGameStatus === GameStatus.ONGOING ? status.legalMoves : [],
      },
    };
  }

  // ──────────────────────────────────────────────
  // Abandon
  // ──────────────────────────────────────────────

  async resign(id: string, color: 'white' | 'black') {
    const game = await this.prisma.game.findUnique({ where: { id } });
    if (!game) throw new NotFoundException(`Partie ${id} introuvable.`);
    if (game.status !== GameStatus.ONGOING) {
      throw new BadRequestException('Cette partie est déjà terminée.');
    }

    const result =
      color === 'white' ? GameResult.BLACK_WIN : GameResult.WHITE_WIN;

    return this.prisma.game.update({
      where: { id },
      data: {
        status: GameStatus.FINISHED,
        result,
        resultReason: ResultReason.RESIGNATION,
        endedAt: new Date(),
      },
    });
  }

  // ──────────────────────────────────────────────
  // Sérialisation
  // ──────────────────────────────────────────────

  private toResponse(game: PrismaGame, moves: any[], legalMoves: string[]) {
    return {
      id: game.id,
      mode: game.mode,
      timeControl: game.timeControl,
      status: game.status,
      result: game.result,
      resultReason: game.resultReason,
      fen: game.currentFen,
      clocks: {
        white: game.whiteTimeRemainingMs,
        black: game.blackTimeRemainingMs,
      },
      legalMoves,
      moves: moves.map((m) => ({
        ply: m.ply,
        san: m.san,
        uci: m.uci,
        fenAfter: m.fenAfter,
        isCheck: m.isCheck,
        isCheckmate: m.isCheckmate,
      })),
    };
  }
}
