// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Tests HTTP des routes /notifications/devices et /push-status
// ─────────────────────────────────────────────────────────────────────────────
import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushService } from './push/push.service';

describe('NotificationsController — appareils push', () => {
  let app: INestApplication;
  const push = { registerDevice: jest.fn(), unregisterDevice: jest.fn(), enabled: true };
  const token = 'fcm-token-'.padEnd(152, 'x');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        { provide: NotificationsService, useValue: {} },
        { provide: PushService, useValue: push },
      ],
    })
      // Garde JWT simulée : utilisateur « u-1 » authentifié
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { userId: 'u-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST /notifications/devices → 204 et enregistrement pour l\'utilisateur connecté', async () => {
    await request(app.getHttpServer())
      .post('/notifications/devices')
      .send({ token, platform: 'ANDROID' })
      .expect(204);
    expect(push.registerDevice).toHaveBeenCalledWith('u-1', token, 'ANDROID');
  });

  it('plateforme inconnue → 400', async () => {
    await request(app.getHttpServer())
      .post('/notifications/devices')
      .send({ token, platform: 'WINDOWS' })
      .expect(400);
    expect(push.registerDevice).not.toHaveBeenCalled();
  });

  it('jeton trop court → 400', async () => {
    await request(app.getHttpServer())
      .post('/notifications/devices')
      .send({ token: 'abc', platform: 'WEB' })
      .expect(400);
  });

  it('DELETE /notifications/devices → 204', async () => {
    await request(app.getHttpServer()).delete('/notifications/devices').send({ token }).expect(204);
    expect(push.unregisterDevice).toHaveBeenCalledWith('u-1', token);
  });

  it('GET /notifications/push-status', async () => {
    const res = await request(app.getHttpServer()).get('/notifications/push-status').expect(200);
    expect(res.body).toEqual({ enabled: true });
  });
});
