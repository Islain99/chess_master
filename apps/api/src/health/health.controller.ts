// ─────────────────────────────────────────────────────────────────────────────
// Sondes de santé
//
//   GET /api/v1/health        → vivacité (liveness) : le processus répond.
//   GET /api/v1/health/ready  → disponibilité (readiness, sprint 19) : la base
//                               répond aussi. Kubernetes retire le pod du
//                               Service tant qu'elle échoue, sans le redémarrer.
// ─────────────────────────────────────────────────────────────────────────────
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
@SkipThrottle() // sondes kubelet toutes les 5 s : jamais limitées
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'ok' };
    } catch {
      throw new ServiceUnavailableException({ status: 'not-ready', database: 'unreachable' });
    }
  }
}
