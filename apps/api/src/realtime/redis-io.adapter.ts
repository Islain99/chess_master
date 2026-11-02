// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Adaptateur Socket.IO Redis (plusieurs réplicas de l'API)
//
// Sans lui, chaque pod a ses propres rooms : avec 2 réplicas, deux joueurs
// connectés à des pods différents ne recevaient jamais les coups l'un de
// l'autre. L'adaptateur relaie les émissions (`server.to(room).emit`) et les
// requêtes `fetchSockets()` entre pods via Redis Pub/Sub.
//
// Activé dès que REDIS_URL est défini (toujours le cas en Kubernetes et en
// Docker Compose). Sans Redis, l'adaptateur en mémoire par défaut est conservé
// (un seul processus, ex. tests).
// ─────────────────────────────────────────────────────────────────────────────
import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { Server, ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private clients: Redis[] = [];

  constructor(app: INestApplicationContext) {
    super(app);
  }

  /** Ouvre les connexions Pub/Sub. À appeler avant `app.useWebSocketAdapter`. */
  async connectToRedis(url: string): Promise<void> {
    const pub = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
    const sub = pub.duplicate();
    for (const client of [pub, sub]) {
      client.on('error', (e) => this.logger.warn(`Redis (Socket.IO) : ${e.message}`));
    }
    await Promise.all([pub.connect(), sub.connect()]);
    this.clients = [pub, sub];
    this.adapterConstructor = createAdapter(pub, sub, { key: 'chess-socket.io' });
    this.logger.log('Adaptateur Socket.IO Redis actif (multi-réplicas).');
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }

  /**
   * Appelé UNE fois, après la fermeture de tous les namespaces.
   * Sprint 20 : les connexions étaient fermées dans close(), appelé pour
   * chaque namespace ; les désabonnements des namespaces suivants partaient
   * alors sur une connexion fermée (« Connection is closed » à l'arrêt).
   * quit() attend la fin des commandes en cours (désabonnements compris).
   */
  async dispose(): Promise<void> {
    await super.dispose();
    await Promise.all(this.clients.map((c) => c.quit().catch(() => undefined)));
    this.clients = [];
  }
}
