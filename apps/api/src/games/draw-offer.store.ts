// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Propositions de nulle partagées entre réplicas
//
// Sprint 17 les gardait dans la mémoire du pod : avec plusieurs réplicas, la
// proposition faite sur le pod A était invisible pour l'adversaire servi par
// le pod B (« aucune proposition de nulle »). Elles vont désormais dans Redis
// (expiration 2 h) ; la version mémoire reste pour les tests et le mode
// mono-processus sans Redis.
// ─────────────────────────────────────────────────────────────────────────────
import { Logger, OnModuleDestroy, Provider } from '@nestjs/common';
import Redis from 'ioredis';
import type { Seat } from './game-access';

export const DRAW_OFFER_STORE = Symbol('DRAW_OFFER_STORE');

export interface DrawOfferStore {
  get(gameId: string): Promise<Seat | null>;
  set(gameId: string, seat: Seat): Promise<void>;
  delete(gameId: string): Promise<void>;
}

export class MemoryDrawOfferStore implements DrawOfferStore {
  private readonly offers = new Map<string, Seat>();

  async get(gameId: string) {
    return this.offers.get(gameId) ?? null;
  }

  async set(gameId: string, seat: Seat) {
    this.offers.set(gameId, seat);
  }

  async delete(gameId: string) {
    this.offers.delete(gameId);
  }
}

/** Une proposition oubliée (partie abandonnée sans fin propre) expire seule. */
export const DRAW_OFFER_TTL_SECONDS = 2 * 60 * 60;

export class RedisDrawOfferStore implements DrawOfferStore, OnModuleDestroy {
  private readonly logger = new Logger(RedisDrawOfferStore.name);

  constructor(private readonly redis: Redis) {
    redis.on('error', (e) => this.logger.warn(`Redis : ${e.message}`));
  }

  private key(gameId: string) {
    return `chess:draw-offer:${gameId}`;
  }

  async get(gameId: string) {
    const value = await this.redis.get(this.key(gameId));
    return value === 'white' || value === 'black' ? value : null;
  }

  async set(gameId: string, seat: Seat) {
    await this.redis.set(this.key(gameId), seat, 'EX', DRAW_OFFER_TTL_SECONDS);
  }

  async delete(gameId: string) {
    await this.redis.del(this.key(gameId));
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}

/** Redis si REDIS_URL est défini (Compose, Kubernetes), sinon mémoire. */
export const drawOfferStoreProvider: Provider = {
  provide: DRAW_OFFER_STORE,
  useFactory: (): DrawOfferStore =>
    process.env.REDIS_URL
      ? new RedisDrawOfferStore(
          new Redis(process.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 }),
        )
      : new MemoryDrawOfferStore(),
};
