import { Test, TestingModule } from '@nestjs/testing';
import { RatingsService } from './ratings.service';
import { PrismaService } from '../prisma/prisma.service';
import { GameMode, GameResult, TimeControlCategory } from '../common/prisma-enums';

const mockPrisma = {
  game:    { findUnique: jest.fn() },
  rating:  { findUnique: jest.fn(), upsert: jest.fn() },
  userStatistics: { upsert: jest.fn() },
  $transaction: jest.fn().mockImplementation((ops) => Promise.all(ops)),
};

describe('RatingsService', () => {
  let service: RatingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RatingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<RatingsService>(RatingsService);
  });

  describe('computeEloDelta()', () => {
    it('donne un delta positif après une victoire', () => {
      const delta = service.computeEloDelta(1200, 1200, 1);
      expect(delta).toBeGreaterThan(0);
    });

    it('donne un delta négatif après une défaite', () => {
      const delta = service.computeEloDelta(1200, 1200, 0);
      expect(delta).toBeLessThan(0);
    });

    it('donne un delta nul pour une nulle entre égaux', () => {
      const delta = service.computeEloDelta(1200, 1200, 0.5);
      expect(delta).toBe(0);
    });

    it('donne un delta plus grand en battant un adversaire plus fort', () => {
      const deltaVsStrong = service.computeEloDelta(1200, 1600, 1);
      const deltaVsEqual  = service.computeEloDelta(1200, 1200, 1);
      expect(deltaVsStrong).toBeGreaterThan(deltaVsEqual);
    });

    it('perd moins en perdant contre un adversaire plus fort', () => {
      const lossVsStrong = service.computeEloDelta(1200, 1600, 0);
      const lossVsEqual  = service.computeEloDelta(1200, 1200, 0);
      expect(Math.abs(lossVsStrong)).toBeLessThan(Math.abs(lossVsEqual));
    });
  });

  describe('getElo()', () => {
    it('retourne 1200 si aucun classement n\'existe', async () => {
      mockPrisma.rating.findUnique.mockResolvedValue(null);
      expect(await service.getElo('u1', TimeControlCategory.BLITZ)).toBe(1200);
    });

    it('retourne le classement existant', async () => {
      mockPrisma.rating.findUnique.mockResolvedValue({ elo: 1450 });
      expect(await service.getElo('u1', TimeControlCategory.BLITZ)).toBe(1450);
    });
  });

  describe('updateAfterGame()', () => {
    it('ignore les parties non classées (mode LOCAL)', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        id: 'g1',
        mode: GameMode.LOCAL,
        result: GameResult.WHITE_WIN,
        whitePlayerId: 'u1',
        blackPlayerId: 'u2',
        timeControl: TimeControlCategory.RAPID,
      });

      await service.updateAfterGame('g1');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('ignore les parties sans résultat', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        id: 'g1',
        mode: GameMode.MATCHMAKING,
        result: null,
        whitePlayerId: 'u1',
        blackPlayerId: 'u2',
        timeControl: TimeControlCategory.RAPID,
      });

      await service.updateAfterGame('g1');
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('met à jour les classements pour une partie classée', async () => {
      mockPrisma.game.findUnique.mockResolvedValue({
        id: 'g1',
        mode: GameMode.MATCHMAKING,
        result: GameResult.WHITE_WIN,
        whitePlayerId: 'u1',
        blackPlayerId: 'u2',
        timeControl: TimeControlCategory.BLITZ,
      });
      mockPrisma.rating.findUnique.mockResolvedValue({ elo: 1200, peakElo: 1200, gamesPlayed: 10 });
      mockPrisma.rating.upsert.mockResolvedValue({});
      mockPrisma.userStatistics.upsert.mockResolvedValue({});

      await service.updateAfterGame('g1');
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
