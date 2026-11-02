// Sprint 19 — Sondes de santé (liveness / readiness)
import { ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const prisma = { $queryRaw: jest.fn() };
  const controller = new HealthController(prisma as unknown as PrismaService);

  it('liveness : toujours ok, sans toucher à la base', () => {
    expect(controller.check()).toMatchObject({ status: 'ok' });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('readiness : ok quand la base répond', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
    await expect(controller.ready()).resolves.toEqual({ status: 'ready', database: 'ok' });
  });

  it('readiness : 503 quand la base est injoignable', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
