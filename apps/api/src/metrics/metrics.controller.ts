import { Controller, Get, Header, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * Sprint 19 — GET /metrics (format Prometheus), hors préfixe /api/v1.
 * Exclu de la limitation de débit : Prometheus interroge toutes les 30 s.
 * Non exposé publiquement : l'ingress ne route que /api, /socket.io et /.
 */
@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  async scrape(@Res() res: Response) {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.render());
  }
}
