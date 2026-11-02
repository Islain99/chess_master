// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Appariement concurrent entre plusieurs réplicas de l'API
//
// Deux instances de MatchmakingService (= deux pods) partagent le même Redis.
// Avant le sprint 19, le verrou portait sur la PAIRE : le pod 1 appariait
// (alice, bob) et le pod 2 (carol, bob) en même temps → bob dans deux parties.
// ─────────────────────────────────────────────────────────────────────────────
import { MatchmakingService } from './matchmaking.service';
import { PrismaService } from '../prisma/prisma.service';
import { createFakeRedis, FakeRedis } from '../testing/fake-redis.mock-spec';

describe('MatchmakingService — plusieurs réplicas', () => {
  const prisma = {
    game: { create: jest.fn() },
    matchmakingQueueEntry: { create: jest.fn() },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  let redis: FakeRedis;
  let pod1: MatchmakingService;
  let pod2: MatchmakingService;

  /** Met un joueur en file sans tenter d'appariement immédiat. */
  async function queued(userId: string, elo: number) {
    await redis.hset(`mm:data:${userId}`, {
      socketId: `s-${userId}`, elo: String(elo), timeControl: 'BLITZ', queuedAt: String(Date.now()),
    });
    await redis.zadd('mm:queue:BLITZ', elo, userId);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    let n = 0;
    prisma.game.create.mockImplementation(async () => ({ id: `game-${++n}` }));
    redis = createFakeRedis();
    pod1 = new MatchmakingService(prisma as unknown as PrismaService);
    pod2 = new MatchmakingService(prisma as unknown as PrismaService);
    (pod1 as any).redis = redis;
    (pod2 as any).redis = redis;
  });

  it('un joueur convoité par deux pods n\'est apparié qu\'une fois', async () => {
    await queued('alice', 1200);
    await queued('bob', 1210);
    await queued('carol', 1220);

    const [m1, m2] = await Promise.all([
      pod1.tryMatch('alice', 'BLITZ' as any, 1200),
      pod2.tryMatch('carol', 'BLITZ' as any, 1220),
    ]);

    const matches = [m1, m2].filter(Boolean);
    expect(matches).toHaveLength(1);
    expect(prisma.game.create).toHaveBeenCalledTimes(1);
    const players = [matches[0]!.whiteUserId, matches[0]!.blackUserId];
    expect(players).toContain('bob');
  });

  it('les verrous sont libérés après l\'appariement (et seulement les nôtres)', async () => {
    await queued('alice', 1200);
    await queued('bob', 1210);
    redis.strings.set('mm:lock:player:zoe', 'autre-pod');

    await expect(pod1.tryMatch('alice', 'BLITZ' as any, 1200)).resolves.toMatchObject({ gameId: 'game-1' });

    expect([...redis.strings.keys()]).toEqual(['mm:lock:player:zoe']);
  });

  it('adversaire déjà verrouillé par un autre pod : pas d\'appariement, verrou partiel rendu', async () => {
    await queued('alice', 1200);
    await queued('bob', 1210);
    redis.strings.set('mm:lock:player:bob', 'autre-pod');

    await expect(pod1.tryMatch('alice', 'BLITZ' as any, 1200)).resolves.toBeNull();

    expect(prisma.game.create).not.toHaveBeenCalled();
    expect(redis.strings.has('mm:lock:player:alice')).toBe(false);
    expect(redis.strings.get('mm:lock:player:bob')).toBe('autre-pod');
  });
});
