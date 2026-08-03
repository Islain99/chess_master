import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import {
  GameMode,
  GameStatus,
  PlayerType,
  QueueStatus,
  TimeControlCategory,
} from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';

const QUEUE_KEY      = (tc: string) => `mm:queue:${tc}`;   // sorted set (score = elo)
const DATA_KEY       = (uid: string) => `mm:data:${uid}`;  // hash { socketId, elo, tc }
const LOCK_KEY       = (a: string, b: string) => `mm:lock:${[a, b].sort().join(':')}`;
const QUEUE_TTL_SEC  = 300; // 5 min max en file
const ELO_RANGE      = 300; // ±300 Elo de départ
const RANGE_EXPAND   = 100; // expansion toutes les 30 s (géré côté gateway)

const INITIAL_MS: Record<TimeControlCategory, number> = {
  BULLET:    60_000,
  BLITZ:    300_000,
  RAPID:    600_000,
  CLASSICAL: 1_800_000,
};

export interface QueueEntry {
  userId:      string;
  socketId:    string;
  elo:         number;
  timeControl: TimeControlCategory;
  queuedAt:    number;
}

export interface MatchResult {
  gameId:          string;
  whiteUserId:     string;
  blackUserId:     string;
  whiteSocketId:   string;
  blackSocketId:   string;
  whiteElo:        number;
  blackElo:        number;
  timeControl:     TimeControlCategory;
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name);
  private redis!: Redis;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
    });
    this.redis.on('error', (e) => this.logger.warn(`Redis : ${e.message}`));
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }

  // ──────────────────────────────────────────────
  // Rejoindre la file
  // ──────────────────────────────────────────────

  async enqueue(entry: QueueEntry): Promise<MatchResult | null> {
    const { userId, socketId, elo, timeControl } = entry;

    // Stocker les données du joueur
    await this.redis.hset(DATA_KEY(userId), {
      socketId,
      elo:         elo.toString(),
      timeControl,
      queuedAt:    Date.now().toString(),
    });
    await this.redis.expire(DATA_KEY(userId), QUEUE_TTL_SEC);

    // Ajouter dans le sorted set (score = elo pour les requêtes par plage)
    await this.redis.zadd(QUEUE_KEY(timeControl), elo, userId);

    // Tenter une correspondance immédiate
    return this.tryMatch(userId, timeControl, elo);
  }

  // ──────────────────────────────────────────────
  // Quitter la file
  // ──────────────────────────────────────────────

  async dequeue(userId: string, timeControl?: TimeControlCategory): Promise<void> {
    const data = await this.getPlayerData(userId);
    const tc   = timeControl ?? (data?.timeControl as TimeControlCategory);

    if (tc) await this.redis.zrem(QUEUE_KEY(tc), userId);
    await this.redis.del(DATA_KEY(userId));

    // Mettre à jour le statut en BDD
    await this.prisma.matchmakingQueueEntry.updateMany({
      where: { userId, status: QueueStatus.WAITING },
      data:  { status: QueueStatus.CANCELLED },
    });

    this.logger.debug(`${userId} retiré de la file ${tc}`);
  }

  // ──────────────────────────────────────────────
  // Tentative de correspondance
  // ──────────────────────────────────────────────

  async tryMatch(
    userId: string,
    timeControl: TimeControlCategory,
    elo: number,
    eloRange = ELO_RANGE,
  ): Promise<MatchResult | null> {
    // Rechercher des candidats dans la plage Elo
    const candidates = await this.redis.zrangebyscore(
      QUEUE_KEY(timeControl),
      elo - eloRange,
      elo + eloRange,
    );

    // Filtrer le joueur lui-même
    const opponents = candidates.filter((id) => id !== userId);
    if (opponents.length === 0) return null;

    // Prendre l'adversaire le plus proche en Elo
    const opponentId = await this.closestElo(opponents, elo);
    if (!opponentId) return null;

    // Verrou pour éviter les doubles appariements
    const lockKey   = LOCK_KEY(userId, opponentId);
    const acquired  = await this.redis.setnx(lockKey, '1');
    if (!acquired) return null; // déjà en cours d'appariement
    await this.redis.expire(lockKey, 10);

    try {
      return await this.createMatch(userId, opponentId, timeControl);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  // ──────────────────────────────────────────────
  // Vérification périodique (appelée par le gateway)
  // ──────────────────────────────────────────────

  async periodicCheck(timeControl: TimeControlCategory): Promise<MatchResult[]> {
    const results: MatchResult[] = [];
    const allQueued = await this.redis.zrange(QUEUE_KEY(timeControl), 0, -1, 'WITHSCORES');

    // Traiter par paires (zrange WITHSCORES retourne [member, score, member, score, ...])
    for (let i = 0; i < allQueued.length; i += 2) {
      const userId = allQueued[i];
      const elo    = parseInt(allQueued[i + 1]);
      const data   = await this.getPlayerData(userId);
      if (!data) continue;

      // Expansion de la plage selon le temps d'attente
      const waitMs   = Date.now() - data.queuedAt;
      const expanded  = ELO_RANGE + Math.floor(waitMs / 30_000) * RANGE_EXPAND;

      const match = await this.tryMatch(userId, timeControl, elo, expanded);
      if (match) results.push(match);
    }

    return results;
  }

  // ──────────────────────────────────────────────
  // Statut de file
  // ──────────────────────────────────────────────

  async getStatus(userId: string): Promise<{
    status: 'waiting' | 'not_in_queue';
    queuedAt?: number;
    elo?: number;
    timeControl?: string;
  }> {
    const data = await this.getPlayerData(userId);
    if (!data) return { status: 'not_in_queue' };
    return {
      status:      'waiting',
      queuedAt:    data.queuedAt,
      elo:         data.elo,
      timeControl: data.timeControl,
    };
  }

  async getQueueSize(timeControl: TimeControlCategory): Promise<number> {
    return this.redis.zcard(QUEUE_KEY(timeControl));
  }

  // ──────────────────────────────────────────────
  // Helpers privés
  // ──────────────────────────────────────────────

  private async getPlayerData(userId: string): Promise<{
    socketId:    string;
    elo:         number;
    timeControl: string;
    queuedAt:    number;
  } | null> {
    const raw = await this.redis.hgetall(DATA_KEY(userId));
    if (!raw?.socketId) return null;
    return {
      socketId:    raw.socketId,
      elo:         parseInt(raw.elo ?? '1200'),
      timeControl: raw.timeControl,
      queuedAt:    parseInt(raw.queuedAt ?? '0'),
    };
  }

  private async closestElo(userIds: string[], elo: number): Promise<string | null> {
    let closest: string | null   = null;
    let minDiff   = Infinity;

    for (const id of userIds) {
      const data = await this.getPlayerData(id);
      if (!data) continue;
      const diff = Math.abs(data.elo - elo);
      if (diff < minDiff) { minDiff = diff; closest = id; }
    }

    return closest;
  }

  private async createMatch(
    userId1: string,
    userId2: string,
    timeControl: TimeControlCategory,
  ): Promise<MatchResult | null> {
    const [data1, data2] = await Promise.all([
      this.getPlayerData(userId1),
      this.getPlayerData(userId2),
    ]);

    if (!data1 || !data2) return null;

    // Attribuer les couleurs aléatoirement
    const whiteFirst  = Math.random() < 0.5;
    const whiteUserId = whiteFirst ? userId1 : userId2;
    const blackUserId = whiteFirst ? userId2 : userId1;
    const whiteData   = whiteFirst ? data1 : data2;
    const blackData   = whiteFirst ? data2 : data1;

    const initialMs = INITIAL_MS[timeControl];

    // Créer la partie en BDD
    const game = await this.prisma.game.create({
      data: {
        mode:                GameMode.MATCHMAKING,
        timeControl,
        initialTimeSeconds:  initialMs / 1000,
        incrementSeconds:    0,
        whitePlayerId:       whiteUserId,
        whitePlayerType:     PlayerType.HUMAN,
        blackPlayerId:       blackUserId,
        blackPlayerType:     PlayerType.HUMAN,
        status:              GameStatus.ONGOING,
        startedAt:           new Date(),
        whiteTimeRemainingMs: initialMs,
        blackTimeRemainingMs: initialMs,
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      },
    });

    // Créer les entrées de file en BDD (statut MATCHED)
    await this.prisma.$transaction([
      this.prisma.matchmakingQueueEntry.create({
        data: {
          userId:      whiteUserId,
          timeControl,
          eloSnapshot: whiteData.elo,
          status:      QueueStatus.MATCHED,
          matchedAt:   new Date(),
        },
      }),
      this.prisma.matchmakingQueueEntry.create({
        data: {
          userId:      blackUserId,
          timeControl,
          eloSnapshot: blackData.elo,
          status:      QueueStatus.MATCHED,
          matchedAt:   new Date(),
        },
      }),
    ]);

    // Retirer les deux joueurs de la file Redis
    await this.redis.zrem(QUEUE_KEY(timeControl), userId1, userId2);
    await this.redis.del(DATA_KEY(userId1), DATA_KEY(userId2));

    this.logger.log(
      `Match trouvé ! ${whiteUserId} (${whiteData.elo}) vs ` +
      `${blackUserId} (${blackData.elo}) — ${timeControl} → partie ${game.id}`,
    );

    return {
      gameId:        game.id,
      whiteUserId,
      blackUserId,
      whiteSocketId: whiteData.socketId,
      blackSocketId: blackData.socketId,
      whiteElo:      whiteData.elo,
      blackElo:      blackData.elo,
      timeControl,
    };
  }
}
