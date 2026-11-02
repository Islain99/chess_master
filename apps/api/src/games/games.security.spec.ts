// ─────────────────────────────────────────────────────────────────────────────
// Sprint 17 — Tests de sécurité de GamesService (parties en ligne)
//
// Scénarios d'attaque corrigés :
//   • jouer pour l'adversaire / hors de son tour / sans être joueur ;
//   • abandonner au nom de l'adversaire ;
//   • forcer une nulle jamais proposée ;
//   • tricher sur la pendule (timeSpentMs = 0) ;
//   • abandonner une partie classée sans perdre d'Elo ;
//   • créer une partie « en ligne » sans joueurs via POST /games.
// ─────────────────────────────────────────────────────────────────────────────
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  GameMode,
  GameResult,
  GameStatus,
  PlayerType,
  ResultReason,
  TimeControlCategory,
} from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { RatingsService } from '../ratings/ratings.service';
import { AiEngineService } from './ai/ai-engine.service';
import { StockfishClientService } from './ai/stockfish-client.service';
import { ChessEngineService } from './chess-engine.service';
import { SYSTEM_ACTOR } from './game-access';
import { GamesService } from './games.service';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const ALICE = 'alice'; // blancs
const BOB = 'bob'; // noirs
const EVE = 'eve'; // spectatrice malveillante

function onlineGame(overrides: Record<string, unknown> = {}) {
  return {
    id: 'g-1',
    mode: GameMode.MATCHMAKING,
    timeControl: TimeControlCategory.BLITZ,
    initialTimeSeconds: 300,
    incrementSeconds: 0,
    whitePlayerId: ALICE,
    whitePlayerType: PlayerType.HUMAN,
    blackPlayerId: BOB,
    blackPlayerType: PlayerType.HUMAN,
    aiLevel: null,
    aiTargetElo: null,
    status: GameStatus.ONGOING,
    result: null,
    resultReason: null,
    initialFen: START,
    currentFen: START,
    pgn: null,
    roomCode: null,
    whiteTimeRemainingMs: 300_000,
    blackTimeRemainingMs: 300_000,
    createdAt: new Date(),
    startedAt: new Date(Date.now() - 4_000), // partie lancée il y a 4 s
    endedAt: null,
    moves: [] as any[],
    ...overrides,
  };
}

const prisma = {
  game: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  move: { create: jest.fn() },
  $transaction: jest.fn(),
};
const ratings = { updateAfterGame: jest.fn().mockResolvedValue(undefined) };

describe('GamesService — autorisations des parties en ligne', () => {
  let service: GamesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GamesService,
        ChessEngineService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiEngineService, useValue: { getBestMove: jest.fn() } },
        { provide: StockfishClientService, useValue: { getBestMove: jest.fn() } },
        { provide: RatingsService, useValue: ratings },
      ],
    }).compile();
    service = moduleRef.get(GamesService);

    // $transaction([create, update]) → renvoie le coup créé et la partie
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => ops);
    prisma.move.create.mockImplementation(({ data }) => ({ ...data, id: 'm-1' }));
    prisma.game.update.mockImplementation(({ data }) => ({ ...onlineGame(), ...data }));
  });

  // ─── Coups ─────────────────────────────────────────────────────────────────

  describe('makeMove', () => {
    it('anonyme → 401', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());
      await expect(service.makeMove('g-1', { uci: 'e2e4' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('spectateur → 403 NOT_A_PLAYER', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());
      await expect(service.makeMove('g-1', { uci: 'e2e4' }, { userId: EVE })).rejects.toMatchObject({
        response: { error: 'NOT_A_PLAYER' },
      });
    });

    it('les noirs ne peuvent pas jouer le coup des blancs → 403 NOT_YOUR_TURN', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());
      const attempt = service.makeMove('g-1', { uci: 'e2e4' }, { userId: BOB });
      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toMatchObject({ response: { error: 'NOT_YOUR_TURN' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('le joueur au trait joue ; la pendule est mesurée par le serveur', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());

      const res = await service.makeMove('g-1', { uci: 'e2e4', timeSpentMs: 0 }, { userId: ALICE });

      const moveData = prisma.move.create.mock.calls[0][0].data;
      // ~4 s écoulées depuis startedAt : la valeur 0 envoyée par le client est ignorée
      expect(moveData.timeSpentMs).toBeGreaterThanOrEqual(3_900);
      expect(res.game.clocks.white).toBeLessThanOrEqual(296_100);
    });

    it('temps écoulé depuis le DERNIER coup (et non depuis le début)', async () => {
      const fenAfterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
      prisma.game.findUnique.mockResolvedValue(
        onlineGame({
          currentFen: fenAfterE4,
          startedAt: new Date(Date.now() - 60_000),
          moves: [{ ply: 1, san: 'e4', fenAfter: fenAfterE4, createdAt: new Date(Date.now() - 2_000) }],
        }),
      );

      await service.makeMove('g-1', { uci: 'e7e5', timeSpentMs: 0 }, { userId: BOB });

      const spent = prisma.move.create.mock.calls[0][0].data.timeSpentMs;
      expect(spent).toBeGreaterThanOrEqual(1_900);
      expect(spent).toBeLessThan(10_000);
    });

    it('partie locale : inchangé (anonyme, temps fourni par le client)', async () => {
      prisma.game.findUnique.mockResolvedValue(
        onlineGame({ mode: GameMode.LOCAL, whitePlayerId: null, blackPlayerId: null }),
      );
      await service.makeMove('g-1', { uci: 'e2e4', timeSpentMs: 1234 });
      expect(prisma.move.create.mock.calls[0][0].data.timeSpentMs).toBe(1234);
    });
  });

  // ─── Abandon ───────────────────────────────────────────────────────────────

  describe('resign', () => {
    it('la couleur abandonnée est celle de l\'auteur, pas celle envoyée', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());

      // Bob (noirs) tente de faire abandonner les blancs
      const ended = await service.resign('g-1', 'white', { userId: BOB });

      expect(ended.result).toBe(GameResult.WHITE_WIN); // c'est Bob qui perd
      expect(prisma.game.update.mock.calls[0][0].data).toMatchObject({
        result: GameResult.WHITE_WIN,
        resultReason: ResultReason.RESIGNATION,
      });
    });

    it('spectateur → 403, partie intacte', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());
      await expect(service.resign('g-1', 'white', { userId: EVE })).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.game.update).not.toHaveBeenCalled();
    });

    it('forfait serveur (SYSTEM_ACTOR) : couleur imposée, motif ABANDONED', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());
      await service.resign('g-1', 'black', SYSTEM_ACTOR, ResultReason.ABANDONED);
      expect(prisma.game.update.mock.calls[0][0].data).toMatchObject({
        result: GameResult.WHITE_WIN,
        resultReason: ResultReason.ABANDONED,
      });
    });

    it('partie classée : l\'abandon met à jour l\'Elo', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame());
      await service.resign('g-1', 'white', { userId: ALICE });
      expect(ratings.updateAfterGame).toHaveBeenCalledWith('g-1');
    });

    it('salle privée (non classée) : pas de calcul Elo', async () => {
      const privateGame = onlineGame({ mode: GameMode.PRIVATE });
      prisma.game.findUnique.mockResolvedValue(privateGame);
      prisma.game.update.mockImplementation(({ data }) => ({ ...privateGame, ...data }));
      await service.resign('g-1', 'white', { userId: ALICE });
      expect(ratings.updateAfterGame).not.toHaveBeenCalled();
    });
  });

  // ─── Nulle ─────────────────────────────────────────────────────────────────

  describe('nulle par accord', () => {
    beforeEach(() => prisma.game.findUnique.mockResolvedValue(onlineGame()));

    it('accepter sans proposition → 409', async () => {
      await expect(service.acceptDraw('g-1', { userId: BOB })).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.game.update).not.toHaveBeenCalled();
    });

    it('on ne peut pas accepter sa propre proposition', async () => {
      await service.offerDraw('g-1', { userId: ALICE });
      await expect(service.acceptDraw('g-1', { userId: ALICE })).rejects.toBeInstanceOf(ConflictException);
    });

    it('proposition des blancs acceptée par les noirs → nulle + Elo', async () => {
      await expect(service.offerDraw('g-1', { userId: ALICE })).resolves.toBe('white');
      const ended = await service.acceptDraw('g-1', { userId: BOB });

      expect(ended).toMatchObject({ result: GameResult.DRAW, resultReason: ResultReason.DRAW_AGREEMENT });
      expect(ratings.updateAfterGame).toHaveBeenCalledWith('g-1');
      // La proposition est consommée : impossible de la réutiliser
      await expect(service.acceptDraw('g-1', { userId: BOB })).rejects.toBeInstanceOf(ConflictException);
    });

    it('un spectateur ne peut ni proposer ni accepter', async () => {
      await expect(service.offerDraw('g-1', { userId: EVE })).rejects.toBeInstanceOf(ForbiddenException);
      await service.offerDraw('g-1', { userId: ALICE });
      await expect(service.acceptDraw('g-1', { userId: EVE })).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refus : la proposition disparaît', async () => {
      await service.offerDraw('g-1', { userId: BOB });
      await service.declineDraw('g-1', { userId: ALICE });
      await expect(service.acceptDraw('g-1', { userId: ALICE })).rejects.toBeInstanceOf(ConflictException);
    });

    it('un coup joué annule la proposition en cours', async () => {
      await service.offerDraw('g-1', { userId: BOB });
      await service.makeMove('g-1', { uci: 'e2e4' }, { userId: ALICE });
      await expect(service.acceptDraw('g-1', { userId: ALICE })).rejects.toBeInstanceOf(ConflictException);
    });

    it('partie locale : nulle immédiate comme avant', async () => {
      prisma.game.findUnique.mockResolvedValue(onlineGame({ mode: GameMode.LOCAL }));
      await expect(service.acceptDraw('g-1')).resolves.toMatchObject({ result: GameResult.DRAW });
    });
  });

  // ─── Création ──────────────────────────────────────────────────────────────

  it('sprint 18 : partie IA d\'un joueur connecté rattachée à son compte, LOCAL anonyme', async () => {
    prisma.game.create.mockImplementation(async ({ data }) => ({ ...onlineGame(), ...data }));

    await service.create({ mode: GameMode.AI, timeControl: TimeControlCategory.RAPID, aiLevel: 3 } as any, { userId: ALICE });
    expect(prisma.game.create.mock.calls[0][0].data.whitePlayerId).toBe(ALICE);

    await service.create({ mode: GameMode.LOCAL, timeControl: TimeControlCategory.RAPID } as any, { userId: ALICE });
    expect(prisma.game.create.mock.calls[1][0].data.whitePlayerId).toBeUndefined();
  });

  it.each([GameMode.PRIVATE, GameMode.MATCHMAKING])(
    'POST /games refuse le mode %s (partie en ligne sans joueurs)',
    async (mode) => {
      await expect(
        service.create({ mode, timeControl: TimeControlCategory.BLITZ } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.game.create).not.toHaveBeenCalled();
    },
  );
});
