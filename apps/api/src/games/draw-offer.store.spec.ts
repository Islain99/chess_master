// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Stockage des propositions de nulle (mémoire et Redis)
// ─────────────────────────────────────────────────────────────────────────────
import {
  DRAW_OFFER_TTL_SECONDS,
  MemoryDrawOfferStore,
  RedisDrawOfferStore,
} from './draw-offer.store';

/** Redis minimal : get/set/del + mémorisation de l'expiration demandée. */
function fakeRedis() {
  const data = new Map<string, string>();
  const ttl = new Map<string, number>();
  return {
    data,
    ttl,
    on: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(async (k: string) => data.get(k) ?? null),
    set: jest.fn(async (k: string, v: string, mode: string, seconds: number) => {
      data.set(k, v);
      if (mode === 'EX') ttl.set(k, seconds);
      return 'OK';
    }),
    del: jest.fn(async (k: string) => Number(data.delete(k))),
  };
}

describe('DrawOfferStore', () => {
  it('mémoire : set / get / delete', async () => {
    const store = new MemoryDrawOfferStore();
    expect(await store.get('g')).toBeNull();
    await store.set('g', 'white');
    expect(await store.get('g')).toBe('white');
    await store.delete('g');
    expect(await store.get('g')).toBeNull();
  });

  it('Redis : clé préfixée, expiration de 2 h, partagée entre deux instances', async () => {
    const redis = fakeRedis();
    const podA = new RedisDrawOfferStore(redis as any);
    const podB = new RedisDrawOfferStore(redis as any);

    await podA.set('g-1', 'black');
    expect(redis.data.get('chess:draw-offer:g-1')).toBe('black');
    expect(redis.ttl.get('chess:draw-offer:g-1')).toBe(DRAW_OFFER_TTL_SECONDS);
    expect(await podB.get('g-1')).toBe('black'); // visible depuis l'autre pod

    await podB.delete('g-1');
    expect(await podA.get('g-1')).toBeNull();
  });

  it('Redis : une valeur inattendue est ignorée', async () => {
    const redis = fakeRedis();
    redis.data.set('chess:draw-offer:g-2', 'purple');
    expect(await new RedisDrawOfferStore(redis as any).get('g-2')).toBeNull();
  });
});
