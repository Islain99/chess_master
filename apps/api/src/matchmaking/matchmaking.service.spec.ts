// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Tests unitaires de MatchmakingService
//
// File d'attente Redis (en mémoire), Prisma simulé. Couvre : inscription,
// appariement immédiat ou différé, plage Elo et son élargissement avec
// l'attente, choix de l'adversaire le plus proche, cadences séparées,
// retrait de la file (y compris à la déconnexion), statut.
// ─────────────────────────────────────────────────────────────────────────────
import { GameMode, GameStatus, PlayerType, QueueStatus } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { createFakeRedis, FakeRedis } from '../testing/fake-redis.mock-spec';
import { MatchmakingService, QueueEntry } from './matchmaking.service';

const BLITZ = 'BLITZ' as any;
const RAPID = 'RAPID' as any;

describe('MatchmakingService', () => {
  const prisma = {
    game: { create: jest.fn() },
    matchmakingQueueEntry: { create: jest.fn((args) => args), updateMany: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  let redis: FakeRedis;
  let service: MatchmakingService;

  const entry = (userId: string, elo: number, timeControl = BLITZ): QueueEntry => ({
    userId, socketId: `s-${userId}`, elo, timeControl, queuedAt: Date.now(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    prisma.game.create.mockImplementation(async ({ data }) => ({
      id: 'game-1',
      ...data,
      whitePlayer: { displayName: `nom-${data.whitePlayerId}` },
      blackPlayer: { displayName: `nom-${data.blackPlayerId}` },
    }));
    redis = createFakeRedis();
    service = new MatchmakingService(prisma as unknown as PrismaService);
    (service as any).redis = redis;
  });

  describe('enqueue()', () => {
    it('seul en file : inscrit (hachage avec expiration + ensemble trié), pas de partie', async () => {
      await expect(service.enqueue(entry('alice', 1500))).resolves.toBeNull();

      expect(redis.hashes.get('mm:data:alice')).toMatchObject({ socketId: 's-alice', elo: '1500', timeControl: 'BLITZ' });
      expect(redis.ttls.get('mm:data:alice')).toBe(300);
      expect(redis.zsets.get('mm:queue:BLITZ')?.get('alice')).toBe(1500);
      expect(prisma.game.create).not.toHaveBeenCalled();
    });

    it('adversaire dans la plage : partie créée et les deux joueurs retirés de la file', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.5 → le demandeur a les blancs
      await service.enqueue(entry('alice', 1500));

      const match = await service.enqueue(entry('bob', 1620));

      expect(match).toEqual({
        gameId: 'game-1',
        whiteUserId: 'bob', blackUserId: 'alice',
        whiteSocketId: 's-bob', blackSocketId: 's-alice',
        whiteElo: 1620, blackElo: 1500,
        whiteName: 'nom-bob', blackName: 'nom-alice',
        timeControl: BLITZ,
      });
      expect(redis.zsets.get('mm:queue:BLITZ')?.size).toBe(0);
      expect(redis.hashes.has('mm:data:alice')).toBe(false);
      expect(redis.hashes.has('mm:data:bob')).toBe(false);
    });

    it('partie classée : mode MATCHMAKING, deux humains, pendule de la cadence', async () => {
      await service.enqueue(entry('alice', 1500));
      await service.enqueue(entry('bob', 1500));

      const { data } = prisma.game.create.mock.calls[0][0];
      expect(data).toMatchObject({
        mode: GameMode.MATCHMAKING,
        timeControl: BLITZ,
        initialTimeSeconds: 300,
        whitePlayerType: PlayerType.HUMAN,
        blackPlayerType: PlayerType.HUMAN,
        status: GameStatus.ONGOING,
        whiteTimeRemainingMs: 300_000,
        blackTimeRemainingMs: 300_000,
      });
      expect([data.whitePlayerId, data.blackPlayerId].sort()).toEqual(['alice', 'bob']);

      // Historique de file en base : deux entrées MATCHED
      const created = prisma.matchmakingQueueEntry.create.mock.calls.map((c) => c[0].data);
      expect(created).toHaveLength(2);
      expect(created.every((d) => d.status === QueueStatus.MATCHED)).toBe(true);
    });

    it('couleurs tirées au sort (Math.random ≥ 0.5 → le demandeur a les noirs)', async () => {
      jest.spyOn(Math, 'random').mockReturnValue(0.9);
      await service.enqueue(entry('alice', 1500));
      const match = await service.enqueue(entry('bob', 1500));
      expect(match).toMatchObject({ whiteUserId: 'alice', blackUserId: 'bob' });
    });

    it('hors plage (±300) : pas d\'appariement immédiat', async () => {
      await service.enqueue(entry('alice', 1200));
      await expect(service.enqueue(entry('bob', 1501))).resolves.toBeNull();
      expect(await service.getQueueSize(BLITZ)).toBe(2);
    });

    it('cadences différentes : jamais appariés ensemble', async () => {
      await service.enqueue(entry('alice', 1500, BLITZ));
      await expect(service.enqueue(entry('bob', 1500, RAPID))).resolves.toBeNull();
    });

    it('choisit l\'adversaire le plus proche en Elo', async () => {
      // Inscrits sans appariement entre eux (écart 450 > 300)…
      await service.enqueue(entry('faible', 1250));
      await service.enqueue(entry('fort', 1700));

      // …mais tous deux dans la plage de « moyen » (1200-1800)
      const match = await service.enqueue(entry('moyen', 1500));

      expect([match!.whiteUserId, match!.blackUserId]).toContain('fort'); // écart 200 < 250
      expect(await service.getQueueSize(BLITZ)).toBe(1);
    });

    it('entrée orpheline (données expirées) : ignorée', async () => {
      await redis.zadd('mm:queue:BLITZ', 1500, 'fantome'); // pas de mm:data:fantome
      await expect(service.enqueue(entry('alice', 1500))).resolves.toBeNull();
      expect(prisma.game.create).not.toHaveBeenCalled();
    });
  });

  describe('periodicCheck()', () => {
    it('la plage s\'élargit de 100 Elo toutes les 30 s d\'attente', async () => {
      const t0 = 1_800_000_000_000;
      const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
      await service.enqueue(entry('alice', 1200));
      await service.enqueue(entry('bob', 1650)); // écart 450 > 300

      now.mockReturnValue(t0 + 60_000); // 2 paliers : 300 + 200 = 500 ≥ 450
      const matches = await service.periodicCheck(BLITZ);

      expect(matches).toHaveLength(1);
      expect(await service.getQueueSize(BLITZ)).toBe(0);
    });

    it('pas encore assez attendu : aucun appariement', async () => {
      const t0 = 1_800_000_000_000;
      const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
      await service.enqueue(entry('alice', 1200));
      await service.enqueue(entry('bob', 1650));

      now.mockReturnValue(t0 + 29_000); // aucun palier franchi
      await expect(service.periodicCheck(BLITZ)).resolves.toEqual([]);
    });
  });

  describe('retrait de la file', () => {
    it('dequeue() : retire de Redis et annule les entrées WAITING en base', async () => {
      await service.enqueue(entry('alice', 1500));

      await service.dequeue('alice');

      expect(await service.getQueueSize(BLITZ)).toBe(0);
      expect(redis.hashes.has('mm:data:alice')).toBe(false);
      expect(prisma.matchmakingQueueEntry.updateMany).toHaveBeenCalledWith({
        where: { userId: 'alice', status: QueueStatus.WAITING },
        data: { status: QueueStatus.CANCELLED },
      });
    });

    it('dequeueSocket() : retire le joueur inscrit par CE socket', async () => {
      await service.enqueue(entry('alice', 1500));
      await expect(service.dequeueSocket('alice', 's-alice')).resolves.toBe(true);
      expect(await service.getQueueSize(BLITZ)).toBe(0);
    });

    it('dequeueSocket() : un autre onglet (autre socket) ne retire pas le joueur', async () => {
      await service.enqueue(entry('alice', 1500));
      await expect(service.dequeueSocket('alice', 's-ancien-onglet')).resolves.toBe(false);
      expect(await service.getQueueSize(BLITZ)).toBe(1);
    });

    it('dequeueSocket() : joueur absent de la file → rien à faire', async () => {
      await expect(service.dequeueSocket('inconnu', 's-x')).resolves.toBe(false);
      expect(prisma.matchmakingQueueEntry.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('getStatus()', () => {
    it('en attente : cadence, Elo et date d\'inscription', async () => {
      await service.enqueue(entry('alice', 1500));
      await expect(service.getStatus('alice')).resolves.toMatchObject({
        status: 'waiting', elo: 1500, timeControl: 'BLITZ', queuedAt: expect.any(Number),
      });
    });

    it('hors file', async () => {
      await expect(service.getStatus('alice')).resolves.toEqual({ status: 'not_in_queue' });
    });
  });
});
