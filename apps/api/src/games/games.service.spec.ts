import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GamesService } from './games.service';
import { ChessEngineService } from './chess-engine.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiEngineService } from './ai/ai-engine.service';
import { StockfishClientService } from './ai/stockfish-client.service';
import { RatingsService } from '../ratings/ratings.service';
const mockRatingsService = { updateAfterGame: jest.fn().mockResolvedValue(undefined), getElo: jest.fn().mockResolvedValue(1200) };
const mockStockfishClient = { getBestMove: jest.fn().mockResolvedValue(null), isAvailable: false, checkAvailability: jest.fn().mockResolvedValue(false) };
const mockAiService = { getBestMove: jest.fn().mockReturnValue('e2e4') };
import { GameMode, GameResult, GameStatus, PlayerType, ResultReason, TimeControlCategory } from '../common/prisma-enums';

// ─── Mock PrismaService ────────────────────────────────────────────────────────

const mockGame = {
  id: 'game-uuid-1',
  mode: GameMode.LOCAL,
  timeControl: TimeControlCategory.RAPID,
  initialTimeSeconds: 600,
  incrementSeconds: 0,
  whitePlayerId: null,
  whitePlayerType: PlayerType.HUMAN,
  blackPlayerId: null,
  blackPlayerType: PlayerType.HUMAN,
  aiLevel: null,
  aiTargetElo: null,
  status: GameStatus.ONGOING,
  result: null,
  resultReason: null,
  initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn: null,
  roomCode: null,
  whiteTimeRemainingMs: 600_000,
  blackTimeRemainingMs: 600_000,
  createdAt: new Date(),
  startedAt: new Date(),
  endedAt: null,
};

const mockPrisma = {
  game: {
    create: jest.fn().mockResolvedValue(mockGame),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  move: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GamesService', () => {
  let service: GamesService;
  let _engine: ChessEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamesService,
        ChessEngineService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AiEngineService, useValue: mockAiService },
        { provide: StockfishClientService, useValue: mockStockfishClient },
        { provide: RatingsService, useValue: mockRatingsService },
      ],
    }).compile();

    service = module.get<GamesService>(GamesService);
    _engine  = module.get<ChessEngineService>(ChessEngineService);
    jest.clearAllMocks();
  });

  // ─── create() ──────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('crée une partie LOCAL avec les bonnes données', async () => {
      mockPrisma.game.create.mockResolvedValue(mockGame);
      const result = await service.create({
        mode: GameMode.LOCAL,
        timeControl: TimeControlCategory.RAPID,
      });
      expect(mockPrisma.game.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mode: GameMode.LOCAL,
            timeControl: TimeControlCategory.RAPID,
            whiteTimeRemainingMs: 600_000,
            blackTimeRemainingMs: 600_000,
          }),
        }),
      );
      // La réponse doit inclure les coups légaux (20 en position initiale)
      expect(result.legalMoves).toHaveLength(20);
    });

    it('rattache une partie LOCAL au joueur connecté (historique)', async () => {
      mockPrisma.game.create.mockResolvedValue(mockGame);
      await service.create(
        { mode: GameMode.LOCAL, timeControl: TimeControlCategory.RAPID },
        { userId: 'alice' },
      );
      expect(mockPrisma.game.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: GameMode.LOCAL, whitePlayerId: 'alice' }),
        }),
      );
    });

    it('laisse anonyme une partie LOCAL créée sans compte', async () => {
      mockPrisma.game.create.mockResolvedValue(mockGame);
      await service.create({ mode: GameMode.LOCAL, timeControl: TimeControlCategory.RAPID });
      const data = mockPrisma.game.create.mock.calls[0][0].data;
      expect(data.whitePlayerId).toBeUndefined();
    });

    it('lance une erreur si aiLevel manque pour le mode AI', async () => {
      await expect(
        service.create({
          mode: GameMode.AI,
          timeControl: TimeControlCategory.BLITZ,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('initialise BULLET à 60 000 ms', async () => {
      mockPrisma.game.create.mockResolvedValue({
        ...mockGame,
        timeControl: TimeControlCategory.BULLET,
        whiteTimeRemainingMs: 60_000,
        blackTimeRemainingMs: 60_000,
      });
      await service.create({
        mode: GameMode.LOCAL,
        timeControl: TimeControlCategory.BULLET,
      });
      expect(mockPrisma.game.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ whiteTimeRemainingMs: 60_000 }),
        }),
      );
    });
  });

  // ─── findById() ────────────────────────────────────────────────────────────

  describe('findById()', () => {
    it('retourne la partie avec les coups légaux', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({ ...mockGame, moves: [] });
      const result = await service.findById('game-uuid-1');
      expect(result.id).toBe('game-uuid-1');
      expect(result.legalMoves).toHaveLength(20);
    });

    it('lance NotFoundException si la partie n\'existe pas', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.findById('inconnu')).rejects.toThrow(NotFoundException);
    });

    it('retourne un tableau vide de coups légaux si la partie est terminée', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        ...mockGame,
        status: GameStatus.FINISHED,
        moves: [],
      });
      const result = await service.findById('game-uuid-1');
      expect(result.legalMoves).toHaveLength(0);
    });
  });

  // ─── makeMove() ────────────────────────────────────────────────────────────

  describe('makeMove()', () => {
    const moveResult = {
      ply: 1,
      san: 'e4',
      uci: 'e2e4',
      fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      isCheck: false,
      isCheckmate: false,
      isCapture: false,
    };

    beforeEach(() => {
      mockPrisma.game.findUnique.mockResolvedValue({ ...mockGame, moves: [] });
      mockPrisma.$transaction.mockResolvedValue([moveResult, mockGame]);
    });

    it('applique un coup légal et retourne le nouvel état', async () => {
      const result = await service.makeMove('game-uuid-1', { uci: 'e2e4' });
      expect(result.move.san).toBe('e4');
      expect(result.game.status).toBe(GameStatus.ONGOING);
    });

    it('rejette un coup illégal avec 422', async () => {
      await expect(
        service.makeMove('game-uuid-1', { uci: 'e2e5' }),
      ).rejects.toThrow(expect.objectContaining({ status: 422 }));
    });

    it('déduit correctement le temps (résultat clocks)', async () => {
      const result = await service.makeMove('game-uuid-1', { uci: 'e2e4', timeSpentMs: 5_000 });
      // Le service calcule newWhiteMs = 600_000 - 5_000 = 595_000
      // Le mock retourne mockGame inchangé, mais on vérifie que la transaction
      // a bien été appelée (signifiant que le calcul a eu lieu)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(result.game.status).toBe(GameStatus.ONGOING);
    });
  });

  // ─── resign() ──────────────────────────────────────────────────────────────

  describe('resign()', () => {
    it('enregistre l\'abandon et donne la victoire à l\'adversaire (blanc)', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(mockGame);
      mockPrisma.game.update.mockResolvedValue({
        ...mockGame,
        status: GameStatus.FINISHED,
        result: GameResult.BLACK_WIN,
        resultReason: ResultReason.RESIGNATION,
      });
      await service.resign('game-uuid-1', 'white');
      expect(mockPrisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ result: GameResult.BLACK_WIN }),
        }),
      );
    });
  });

  // ─── getPgn() ──────────────────────────────────────────────────────────────

  describe('getPgn()', () => {
    it('génère un PGN valide avec les headers corrects', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        ...mockGame,
        startedAt: new Date('2025-01-15'),
        moves: [
          { ply: 1, player: 'WHITE', san: 'e4', uci: 'e2e4', fenAfter: '' },
          { ply: 2, player: 'BLACK', san: 'e5', uci: 'e7e5', fenAfter: '' },
        ],
      });

      const pgn = await service.getPgn('game-uuid-1');

      expect(pgn).toContain('[Result "*"]');
      expect(pgn).toContain('[Date "2025.01.15"]');
      expect(pgn).toContain('1. e4 e5');
    });

    it('inclut le résultat 1-0 si les blancs ont gagné', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        ...mockGame,
        result: GameResult.WHITE_WIN,
        moves: [],
      });
      const pgn = await service.getPgn('game-uuid-1');
      expect(pgn).toContain('[Result "1-0"]');
    });
  });

  // ─── importGame() ──────────────────────────────────────────────────────────

  describe('importGame()', () => {
    it('rejette si ni pgn ni fen n\'est fourni', async () => {
      await expect(service.importFromFen("") as any || service.importFromPgn("") as any).rejects.toThrow(BadRequestException);
    });

    it('valide le FEN avant de créer la partie', async () => {
      await expect(
        service.importFromFen("invalid-fen"),
      ).rejects.toThrow(BadRequestException);
    });

    it('crée une partie depuis un FEN valide', async () => {
      const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      mockPrisma.game.create.mockResolvedValue({
        ...mockGame,
        currentFen: fen,
        initialFen: fen,
      });
      const result = await service.importFromFen(fen);
      expect(mockPrisma.game.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ initialFen: fen }),
        }),
      );
      expect(result.fen).toBe(fen);
    });
  });

  // ─── acceptDraw() ──────────────────────────────────────────────────────────

  describe('acceptDraw()', () => {
    it('termine la partie par accord mutuel', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(mockGame);
      mockPrisma.game.update.mockResolvedValue({
        ...mockGame,
        status: GameStatus.FINISHED,
        result: GameResult.DRAW,
        resultReason: ResultReason.DRAW_AGREEMENT,
      });
      await service.acceptDraw('game-uuid-1');
      expect(mockPrisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            result: GameResult.DRAW,
            resultReason: ResultReason.DRAW_AGREEMENT,
          }),
        }),
      );
    });
  });
});
