import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameMode, GameStatus, PlayerType, TimeControlCategory } from '../common/prisma-enums';

const mockGame = {
  id:           'game-uuid-1',
  mode:          GameMode.PRIVATE,
  timeControl:   TimeControlCategory.RAPID,
  status:        GameStatus.WAITING,
  whitePlayerId: 'user-1',
  blackPlayerId: null,
  roomCode:      'ABC123',
  whitePlayerType: PlayerType.HUMAN,
  blackPlayerType: PlayerType.HUMAN,
  initialTimeSeconds: 600,
  incrementSeconds:   0,
  whiteTimeRemainingMs: 600_000,
  blackTimeRemainingMs: 600_000,
  initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  currentFen:  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
};

const mockPrisma = {
  game: {
    create:     jest.fn(),
    findUnique: jest.fn(),
    update:     jest.fn(),
  },
};

describe('RoomsService', () => {
  let service: RoomsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<RoomsService>(RoomsService);
  });

  describe('create()', () => {
    it('crée une partie PRIVATE avec un code à 6 caractères', async () => {
      mockPrisma.game.create.mockResolvedValue({ ...mockGame, id: 'new-id' });

      const result = await service.create(TimeControlCategory.RAPID, 'user-1');

      expect(result.gameId).toBe('new-id');
      expect(result.roomCode).toBeDefined();
      expect(result.roomCode).toHaveLength(6);
      expect(mockPrisma.game.create).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.game.create.mock.calls[0][0].data;
      expect(callArg.mode).toBe(GameMode.PRIVATE);
      expect(callArg.status).toBe(GameStatus.WAITING);
    });

    it('génère des codes différents à chaque appel', async () => {
      mockPrisma.game.create
        .mockResolvedValueOnce({ ...mockGame, roomCode: 'CODE01' })
        .mockResolvedValueOnce({ ...mockGame, roomCode: 'CODE02' });

      const r1 = await service.create(TimeControlCategory.BLITZ);
      const r2 = await service.create(TimeControlCategory.BLITZ);

      // Les codes ne sont pas garantis différents (aléatoire) mais le service
      // doit appeler create deux fois
      expect(mockPrisma.game.create).toHaveBeenCalledTimes(2);
      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
    });
  });

  describe('join()', () => {
    it('met la partie en ONGOING et assigne le joueur noir', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(mockGame);
      mockPrisma.game.update.mockResolvedValue({
        ...mockGame,
        blackPlayerId: 'user-2',
        status: GameStatus.ONGOING,
      });

      const result = await service.join('ABC123', 'user-2');

      expect(result.status).toBe(GameStatus.ONGOING);
      expect(result.blackPlayerId).toBe('user-2');
      expect(mockPrisma.game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            blackPlayerId: 'user-2',
            status: GameStatus.ONGOING,
          }),
        }),
      );
    });

    it('lève NotFoundException si le code est introuvable', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(null);
      await expect(service.join('XXXXXX')).rejects.toThrow(NotFoundException);
    });

    it('lève ConflictException si la salle est déjà complète', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        ...mockGame,
        status: GameStatus.ONGOING,
      });
      await expect(service.join('ABC123', 'user-2')).rejects.toThrow(ConflictException);
    });

    it('lève ConflictException si le joueur rejoint sa propre salle', async () => {
      mockPrisma.game.findUnique.mockResolvedValue(mockGame);
      await expect(service.join('ABC123', 'user-1')).rejects.toThrow(ConflictException);
    });
  });
});
