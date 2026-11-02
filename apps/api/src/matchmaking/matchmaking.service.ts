import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
// Sprint 19 : verrou PAR JOUEUR (et non par paire). Avec plusieurs réplicas,
// le pod A pouvait apparier (A, B) pendant que le pod B appariait (B, C) :
// deux verrous de paire différents → B jeté dans deux parties.
const PLAYER_LOCK_KEY = (uid: string) => `mm:lock:player:${uid}`;
const LOCK_TTL_SEC   = 10;
/** Supprime le verrou seulement s'il nous appartient encore (jeton). */
const UNLOCK_SCRIPT  =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
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
  /** Sprint 20 : noms affichés, transmis dans lobby:matchFound. */
  whiteName:       string | null;
  blackName:       string | null;
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

  /**
   * Sprint 20 — Retire le joueur de la file SI c'est bien ce socket qui l'y a
   * inscrit. Appelé à la déconnexion du lobby : avant, un joueur qui fermait
   * l'appli restait en file jusqu'à 5 min et pouvait être apparié à une
   * partie que personne ne jouerait (forfait de l'adversaire présent).
   * Si le joueur s'est réinscrit depuis un autre onglet, on ne touche à rien.
   */
  async dequeueSocket(userId: string, socketId: string): Promise<boolean> {
    const data = await this.getPlayerData(userId);
    if (!data || data.socketId !== socketId) return false;
    await this.dequeue(userId, data.timeControl as TimeControlCategory);
    return true;
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

    // Verrous des deux joueurs : un joueur ne peut être apparié que par un
    // seul processus à la fois, quel que soit le pod (sprint 19).
    const token  = randomUUID();
    const locked = await this.lockPlayers([userId, opponentId], token);
    if (locked.length < 2) {
      await this.unlockPlayers(locked, token);
      return null; // l'un des deux est déjà en cours d'appariement
    }

    try {
      // Un autre pod a pu les apparier entre la lecture de la file et le
      // verrou : on revérifie qu'ils y sont toujours tous les deux.
      const [score1, score2] = await Promise.all([
        this.redis.zscore(QUEUE_KEY(timeControl), userId),
        this.redis.zscore(QUEUE_KEY(timeControl), opponentId),
      ]);
      if (score1 === null || score2 === null) return null;

      return await this.createMatch(userId, opponentId, timeControl);
    } finally {
      await this.unlockPlayers(locked, token);
    }
  }

  /**
   * Prend les verrous dans l'ordre alphabétique (pas d'interblocage) et
   * s'arrête au premier refus. Renvoie les identifiants effectivement verrouillés.
   */
  private async lockPlayers(userIds: string[], token: string): Promise<string[]> {
    const locked: string[] = [];
    for (const uid of [...userIds].sort()) {
      const ok = await this.redis.set(PLAYER_LOCK_KEY(uid), token, 'EX', LOCK_TTL_SEC, 'NX');
      if (ok !== 'OK') break;
      locked.push(uid);
    }
    return locked;
  }

  private async unlockPlayers(userIds: string[], token: string): Promise<void> {
    await Promise.all(
      userIds.map((uid) => this.redis.eval(UNLOCK_SCRIPT, 1, PLAYER_LOCK_KEY(uid), token)),
    );
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
      include: {
        whitePlayer: { select: { displayName: true } },
        blackPlayer: { select: { displayName: true } },
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
      whiteName:     game.whitePlayer?.displayName ?? null,
      blackName:     game.blackPlayer?.displayName ?? null,
      timeControl,
    };
  }
}
