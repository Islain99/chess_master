import { NotFoundException } from '@nestjs/common';
import { AntiCheatService } from './anti-cheat.service';

/** Coups d'un joueur : [temps du 1er coup ignoré, puis les suivants]. */
function moves(color: 'WHITE' | 'BLACK', times: number[], startPly: number) {
  return times.map((t, i) => ({ ply: startPly + i * 2, player: color, timeSpentMs: t }));
}

describe('AntiCheatService', () => {
  let prisma: any;
  let analysis: { requestAnalysis: jest.Mock };
  let service: AntiCheatService;

  const human = [5_000, 3_200, 8_100, 1_500, 12_000, 2_400, 6_700, 900, 4_300, 7_800, 2_100, 5_500];
  const bot = [5_000, 50, 52, 49, 51, 50, 48, 50, 51, 49, 50, 52];

  function game(white: number[], black: number[], mode = 'MATCHMAKING') {
    return {
      id: 'g1',
      mode,
      whitePlayerId: 'alice',
      blackPlayerId: 'bob',
      moves: [...moves('WHITE', white, 1), ...moves('BLACK', black, 2)].sort((a, b) => a.ply - b.ply),
    };
  }

  beforeEach(() => {
    prisma = {
      game: { findUnique: jest.fn() },
      cheatReport: {
        upsert: jest.fn(async ({ create }) => ({ id: 'r1', ...create })),
        findUnique: jest.fn(),
        update: jest.fn(async ({ data }) => ({ id: 'r1', ...data })),
        findMany: jest.fn(),
      },
      user: { update: jest.fn() },
      refreshToken: { updateMany: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    analysis = { requestAnalysis: jest.fn().mockResolvedValue({ jobId: 'j' }) };
    service = new AntiCheatService(prisma, analysis as any);
  });

  it('rythme de bot (coups < 100 ms, réguliers) : signalement TIMING pour ce joueur seulement', async () => {
    prisma.game.findUnique.mockResolvedValue(game(human, bot));
    const reports = await service.reviewFinishedGame('g1');

    expect(reports).toHaveLength(1);
    expect(prisma.cheatReport.upsert).toHaveBeenCalledTimes(1);
    const { create } = prisma.cheatReport.upsert.mock.calls[0][0];
    expect(create).toMatchObject({ userId: 'bob', gameId: 'g1', source: 'TIMING' });
    expect(create.score).toBeGreaterThanOrEqual(AntiCheatService.REPORT_THRESHOLD);
    expect(create.reasons.length).toBeGreaterThan(0);
  });

  it('rythme humain : aucun signalement, mais analyse Stockfish de fond lancée', async () => {
    prisma.game.findUnique.mockResolvedValue(game(human, human));
    expect(await service.reviewFinishedGame('g1')).toEqual([]);
    expect(prisma.cheatReport.upsert).not.toHaveBeenCalled();
    expect(analysis.requestAnalysis).toHaveBeenCalledWith('g1', AntiCheatService.BACKGROUND_ANALYSIS_DEPTH);
  });

  it('partie non classée : ni contrôle ni analyse', async () => {
    prisma.game.findUnique.mockResolvedValue(game(bot, bot, 'PRIVATE'));
    expect(await service.reviewFinishedGame('g1')).toEqual([]);
    expect(analysis.requestAnalysis).not.toHaveBeenCalled();
  });

  it('partie trop courte : pas de jugement sur le rythme', async () => {
    prisma.game.findUnique.mockResolvedValue(game(bot.slice(0, 5), bot.slice(0, 5)));
    expect(await service.reviewFinishedGame('g1')).toEqual([]);
  });

  it('le premier coup (attente du début) est ignoré', async () => {
    // 10 coups de bot après un premier coup très long : signalé quand même.
    prisma.game.findUnique.mockResolvedValue(game(human, [60_000, ...bot.slice(1)]));
    expect(await service.reviewFinishedGame('g1')).toHaveLength(1);
  });

  it('échec de l\'analyse de fond : sans effet sur le contrôle', async () => {
    analysis.requestAnalysis.mockRejectedValue(new Error('Redis indisponible'));
    prisma.game.findUnique.mockResolvedValue(game(human, bot));
    await expect(service.reviewFinishedGame('g1')).resolves.toHaveLength(1);
  });

  describe('revue par un administrateur', () => {
    it('CONFIRMED + suspension : compte désactivé et sessions révoquées', async () => {
      prisma.cheatReport.findUnique.mockResolvedValue({ id: 'r1', userId: 'bob' });
      await service.reviewReport('r1', 'CONFIRMED', true);
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'bob' }, data: { isActive: false } });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('DISMISSED : aucun effet sur le compte', async () => {
      prisma.cheatReport.findUnique.mockResolvedValue({ id: 'r1', userId: 'bob' });
      await service.reviewReport('r1', 'DISMISSED', true);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('signalement inconnu : 404', async () => {
      prisma.cheatReport.findUnique.mockResolvedValue(null);
      await expect(service.reviewReport('x', 'DISMISSED')).rejects.toThrow(NotFoundException);
    });
  });
});
