// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Métriques Prometheus de l'API
//
// Exposées sur GET /metrics (hors préfixe /api/v1, non routé par l'ingress).
// Registre propre au service (et non le registre global de prom-client) :
// plusieurs instances — tests, rechargements — ne se marchent pas dessus.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

const PREFIX = 'chess_api_';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** Requêtes HTTP par méthode, route (gabarit, pas l'URL brute) et statut. */
  readonly httpRequests = new Counter({
    name: `${PREFIX}http_requests_total`,
    help: 'Requêtes HTTP traitées',
    labelNames: ['method', 'route', 'status'] as const,
    registers: [this.registry],
  });

  readonly httpDuration = new Histogram({
    name: `${PREFIX}http_request_duration_seconds`,
    help: 'Durée de traitement des requêtes HTTP',
    labelNames: ['method', 'route'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [this.registry],
  });

  /** Sockets ouverts sur CE pod, par namespace Socket.IO. */
  readonly wsConnections = new Gauge({
    name: `${PREFIX}ws_connections`,
    help: 'Connexions Socket.IO ouvertes sur ce pod',
    labelNames: ['namespace'] as const,
    registers: [this.registry],
  });

  readonly gamesFinished = new Counter({
    name: `${PREFIX}games_finished_total`,
    help: 'Parties terminées en ligne, par motif',
    labelNames: ['reason'] as const,
    registers: [this.registry],
  });

  readonly pushSent = new Counter({
    name: `${PREFIX}push_notifications_total`,
    help: 'Envois de notifications push FCM, par résultat',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  constructor() {
    // Mémoire, CPU, boucle d'événements, GC… préfixés chess_api_.
    collectDefaultMetrics({ register: this.registry, prefix: PREFIX });
  }

  wsConnected(namespace: string) {
    this.wsConnections.inc({ namespace });
  }

  wsDisconnected(namespace: string) {
    this.wsConnections.dec({ namespace });
  }

  gameFinished(game: { resultReason?: string | null }) {
    this.gamesFinished.inc({ reason: game.resultReason ?? 'UNKNOWN' });
  }

  pushResult(result: string, count = 1) {
    if (count > 0) this.pushSent.inc({ result }, count);
  }

  /** Corps de la réponse /metrics (format texte Prometheus). */
  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
