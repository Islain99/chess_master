// ─────────────────────────────────────────────────────────────────────────────
// Sprint 17 — Tests HTTP : identité transmise par la garde JWT facultative
// (vraie stratégie passport-jwt, GamesService simulé)
// ─────────────────────────────────────────────────────────────────────────────
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

describe('GamesController — garde JWT facultative', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const games = {
    makeMove: jest.fn().mockResolvedValue({ ok: true }),
    resign: jest.fn().mockResolvedValue({ ok: true }),
    acceptDraw: jest.fn().mockResolvedValue({ ok: true }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PassportModule.register({ defaultStrategy: 'jwt' }),
        JwtModule.register({ secret: process.env.JWT_ACCESS_SECRET ?? 'change-me' }),
      ],
      controllers: [GamesController],
      providers: [JwtStrategy, { provide: GamesService, useValue: games }],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    jwt = moduleRef.get(JwtService);
  });

  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  it('sans jeton : requête acceptée en anonyme (parties locales)', async () => {
    await request(app.getHttpServer()).post('/games/g-1/moves').send({ uci: 'e2e4' }).expect(201);
    expect(games.makeMove).toHaveBeenCalledWith('g-1', { uci: 'e2e4' }, { userId: undefined });
  });

  it('avec un jeton valide : l\'identité est transmise au service', async () => {
    const token = jwt.sign({ sub: 'alice', email: 'a@x.io' });
    await request(app.getHttpServer())
      .post('/games/g-1/moves')
      .set('Authorization', `Bearer ${token}`)
      .send({ uci: 'e2e4' })
      .expect(201);
    expect(games.makeMove.mock.calls[0][2]).toEqual({ userId: 'alice' });
  });

  it('jeton falsifié : traité comme anonyme (jamais comme un autre joueur)', async () => {
    const forged = new JwtService({ secret: 'mauvais-secret' }).sign({ sub: 'bob' });
    await request(app.getHttpServer())
      .post('/games/g-1/resign')
      .set('Authorization', `Bearer ${forged}`)
      .send({ color: 'white' })
      .expect(200);
    expect(games.resign).toHaveBeenCalledWith('g-1', 'white', { userId: undefined });
  });

  it('resign : couleur assainie et acteur transmis', async () => {
    const token = jwt.sign({ sub: 'bob' });
    await request(app.getHttpServer())
      .post('/games/g-1/resign')
      .set('Authorization', `Bearer ${token}`)
      .send({ color: 'nimporte' })
      .expect(200);
    expect(games.resign).toHaveBeenCalledWith('g-1', 'white', { userId: 'bob' });
  });

  it('draw : acteur transmis', async () => {
    const token = jwt.sign({ sub: 'bob' });
    await request(app.getHttpServer())
      .post('/games/g-1/draw')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(games.acceptDraw).toHaveBeenCalledWith('g-1', { userId: 'bob' });
  });
});
