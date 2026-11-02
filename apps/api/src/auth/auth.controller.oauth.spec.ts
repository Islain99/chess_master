// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Tests HTTP des routes OAuth du AuthController
// (vraie application Nest + ValidationPipe identique à main.ts, services simulés)
// ─────────────────────────────────────────────────────────────────────────────
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthProvider } from '../common/prisma-enums';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthVerifierService } from './oauth/oauth-verifier.service';
import { OAuthProviderParam } from './oauth/oauth.types';

describe('AuthController — OAuth', () => {
  let app: INestApplication;
  const oauth = { verify: jest.fn() };
  const auth = { loginWithOAuth: jest.fn() };
  const env: Record<string, string> = { APPLE_ANDROID_PACKAGE: 'com.islain99.chess_client' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: OAuthVerifierService, useValue: oauth },
        { provide: ConfigService, useValue: { get: (k: string) => env[k] } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('POST /auth/oauth/google → 200 avec nos jetons', async () => {
    oauth.verify.mockResolvedValue({ provider: AuthProvider.GOOGLE, providerId: 'g-1' });
    auth.loginWithOAuth.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });

    const res = await request(app.getHttpServer())
      .post('/auth/oauth/google')
      .send({ token: 'header.payload.signature', extra: 'ignoré' })
      .expect(200);

    expect(res.body).toEqual({ accessToken: 'a', refreshToken: 'r', expiresIn: 900 });
    // whitelist : le champ inconnu « extra » est retiré avant le service
    expect(oauth.verify).toHaveBeenCalledWith(OAuthProviderParam.GOOGLE, { token: 'header.payload.signature' });
  });

  it('fournisseur inconnu → 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/oauth/github')
      .send({ token: 'header.payload.signature' })
      .expect(400);
    expect(oauth.verify).not.toHaveBeenCalled();
  });

  it('jeton manquant → 400', async () => {
    await request(app.getHttpServer()).post('/auth/oauth/apple').send({}).expect(400);
    expect(oauth.verify).not.toHaveBeenCalled();
  });

  it('jeton refusé par le vérificateur → 401', async () => {
    oauth.verify.mockRejectedValue(new UnauthorizedException('Jeton Google invalide ou expiré.'));
    await request(app.getHttpServer())
      .post('/auth/oauth/google')
      .send({ token: 'header.payload.signature' })
      .expect(401);
    expect(auth.loginWithOAuth).not.toHaveBeenCalled();
  });

  it('profil incohérent avec le fournisseur demandé → refusé (500), aucune connexion', async () => {
    oauth.verify.mockResolvedValue({ provider: AuthProvider.FACEBOOK, providerId: 'x' });
    await request(app.getHttpServer())
      .post('/auth/oauth/google')
      .send({ token: 'header.payload.signature' })
      .expect(500);
    expect(auth.loginWithOAuth).not.toHaveBeenCalled();
  });

  it('POST /auth/oauth/apple/callback → 303 vers l\'intent Android', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/oauth/apple/callback')
      .type('form')
      .send({ code: 'c0de', id_token: 'jwt', state: 's' })
      .expect(303);

    expect(res.headers.location).toBe(
      'intent://callback?code=c0de&id_token=jwt&state=s' +
        '#Intent;package=com.islain99.chess_client;scheme=signinwithapple;end',
    );
    expect(oauth.verify).not.toHaveBeenCalled();
  });
});
