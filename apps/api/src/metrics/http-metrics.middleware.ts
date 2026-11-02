// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Mesure de chaque requête HTTP (durée, statut)
//
// Le label « route » est le GABARIT Express (/api/v1/games/:id) et non l'URL
// réelle : sinon chaque identifiant de partie créerait une série Prometheus.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    // Ne pas se mesurer soi-même. originalUrl : `req.path` est relatif au
    // point de montage du middleware (« / » avec forRoutes('*')).
    if (req.originalUrl.split('?')[0] === '/metrics') return next();
    const stop = this.metrics.httpDuration.startTimer();

    res.on('finish', () => {
      const route = routeTemplate(req);
      stop({ method: req.method, route });
      this.metrics.httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
    });
    next();
  }
}

/** Gabarit de route ; « unmatched » pour les 404 (pas d'explosion de séries). */
export function routeTemplate(req: Pick<Request, 'baseUrl' | 'route'>): string {
  const path = req.route?.path as string | undefined;
  return path ? `${req.baseUrl ?? ''}${path}` : 'unmatched';
}
