// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Métriques Prometheus du moteur IA (préfixe chess_ai_)
//
// Exposées sur GET /metrics (port 3001, interne au cluster) et collectées par
// le ServiceMonitor du chart Helm. Permet de suivre la latence des coups de
// l'IA et le volume / la durée des analyses de parties.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

const PREFIX = 'chess_ai_';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** Durée d'un calcul de coup (POST /move), par résultat ok / error. */
  readonly bestMoveDuration = new Histogram({
    name: `${PREFIX}bestmove_duration_seconds`,
    help: 'Durée de calcul du meilleur coup Stockfish',
    labelNames: ['result'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  /** Analyses de parties (file BullMQ), par résultat completed / failed. */
  readonly analysisJobs = new Counter({
    name: `${PREFIX}analysis_jobs_total`,
    help: 'Analyses de parties traitées',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  readonly analysisDuration = new Histogram({
    name: `${PREFIX}analysis_duration_seconds`,
    help: 'Durée d\'analyse complète d\'une partie',
    buckets: [5, 15, 30, 60, 120, 300, 600],
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: PREFIX });
  }

  /** Chronomètre `fn` et enregistre sa durée avec result=ok|error. */
  async timeBestMove<T>(fn: () => Promise<T>): Promise<T> {
    const stop = this.bestMoveDuration.startTimer();
    try {
      const value = await fn();
      stop({ result: 'ok' });
      return value;
    } catch (err) {
      stop({ result: 'error' });
      throw err;
    }
  }

  /** Chronomètre une analyse et compte completed / failed. */
  async timeAnalysis<T>(fn: () => Promise<T>): Promise<T> {
    const stop = this.analysisDuration.startTimer();
    try {
      const value = await fn();
      this.analysisJobs.inc({ result: 'completed' });
      return value;
    } catch (err) {
      this.analysisJobs.inc({ result: 'failed' });
      throw err;
    } finally {
      stop();
    }
  }
}
