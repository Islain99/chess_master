// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Redis en mémoire pour les tests unitaires
//
// Couvre les commandes utilisées par MatchmakingService (hachages, ensembles
// triés, chaînes avec NX/EX, script de déverrouillage). Chaque commande est
// asynchrone et cède la main (setImmediate) : deux services qui partagent la
// même instance s'entrelacent comme deux pods réels.
//
// Le suffixe « .mock-spec.ts » exclut ce fichier du build de production
// (tsconfig.build : **/*spec.ts) sans que Jest le prenne pour une suite.
// ─────────────────────────────────────────────────────────────────────────────

export type FakeRedis = ReturnType<typeof createFakeRedis>;

export function createFakeRedis() {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const zsets = new Map<string, Map<string, number>>();
  const ttls = new Map<string, number>();
  const tick = () => new Promise<void>((r) => setImmediate(r));
  const zset = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;
  const sorted = (k: string) => [...zset(k)].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));

  return {
    strings,
    hashes,
    zsets,
    ttls,
    on: jest.fn(),
    disconnect: jest.fn(),

    async set(k: string, v: string, ...args: (string | number)[]) {
      await tick();
      if (args.includes('NX') && strings.has(k)) return null;
      strings.set(k, v);
      const ex = args.indexOf('EX');
      if (ex >= 0) ttls.set(k, Number(args[ex + 1]));
      return 'OK';
    },
    async get(k: string) {
      await tick();
      return strings.get(k) ?? null;
    },
    /** Seul script utilisé : « supprimer la clé si sa valeur vaut ARGV[1] ». */
    async eval(_script: string, _n: number, key: string, token: string) {
      await tick();
      if (strings.get(key) !== token) return 0;
      strings.delete(key);
      return 1;
    },
    async hset(k: string, v: Record<string, string>) {
      await tick();
      hashes.set(k, { ...(hashes.get(k) ?? {}), ...v });
      return Object.keys(v).length;
    },
    async hgetall(k: string) {
      await tick();
      return { ...(hashes.get(k) ?? {}) };
    },
    async expire(k: string, seconds: number) {
      ttls.set(k, seconds);
      return 1;
    },
    async del(...keys: string[]) {
      await tick();
      let n = 0;
      for (const k of keys) {
        n += Number(strings.delete(k)) + Number(hashes.delete(k)) + Number(zsets.delete(k));
      }
      return n;
    },
    async zadd(k: string, score: number, member: string) {
      await tick();
      zset(k).set(member, score);
      return 1;
    },
    async zrem(k: string, ...members: string[]) {
      await tick();
      return members.filter((m) => zset(k).delete(m)).length;
    },
    async zscore(k: string, member: string) {
      await tick();
      const s = zset(k).get(member);
      return s === undefined ? null : String(s);
    },
    async zcard(k: string) {
      await tick();
      return zset(k).size;
    },
    async zrangebyscore(k: string, min: number, max: number) {
      await tick();
      return sorted(k).filter(([, s]) => s >= min && s <= max).map(([m]) => m);
    },
    async zrange(k: string, start: number, stop: number, withScores?: string) {
      await tick();
      const all = sorted(k);
      const slice = all.slice(start, stop === -1 ? undefined : stop + 1);
      return withScores === 'WITHSCORES'
        ? slice.flatMap(([m, s]) => [m, String(s)])
        : slice.map(([m]) => m);
    },
  };
}
