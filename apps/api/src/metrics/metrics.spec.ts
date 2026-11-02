// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Tests du module de métriques Prometheus
//
// Application Nest réelle (Express) avec le même préfixe global que main.ts :
// /metrics doit rester HORS du préfixe /api/v1 (cible de scrape stable) et les
// routes doivent être étiquetées par leur gabarit, jamais par l'URL brute.
// ─────────────────────────────────────────────────────────────────────────────
import { Controller, Get, INestApplication, Param, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { routeTemplate } from './http-metrics.middleware';
import { MetricsModule } from './metrics.module';
import { MetricsService } from './metrics.service';

@Controller('games')
class DummyController {
  @Get(':id')
  find(@Param('id') id: string) {
    return { id };
  }
}

describe('Métriques Prometheus', () => {
  let app: INestApplication;
  let metrics: MetricsService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule],
      controllers: [DummyController],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: [{ path: 'metrics', method: RequestMethod.GET }] });
    await app.init();
    metrics = app.get(MetricsService);
  });

  afterAll(() => app.close());

  it('GET /metrics hors préfixe, au format texte Prometheus', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('chess_api_process_cpu_user_seconds_total');
    await request(app.getHttpServer()).get('/api/v1/metrics').expect(404);
  });

  it('étiquette les requêtes par gabarit de route (pas d\'identifiant)', async () => {
    await request(app.getHttpServer()).get('/api/v1/games/abc-123').expect(200);
    await request(app.getHttpServer()).get('/api/v1/games/def-456').expect(200);
    await request(app.getHttpServer()).get('/api/v1/nope').expect(404);

    const text = await metrics.render();
    expect(text).toMatch(
      /chess_api_http_requests_total\{method="GET",route="\/api\/v1\/games\/:id",status="200"\} 2/,
    );
    // /nope + le /api/v1/metrics du test précédent
    expect(text).toMatch(/route="unmatched",status="404"\} 2/);
    expect(text).not.toContain('abc-123');
    expect(text).not.toMatch(/route="\/metrics"/); // le scrape ne se compte pas
  });

  it('compteurs métier : sockets, fins de partie, push', async () => {
    metrics.wsConnected('game');
    metrics.wsConnected('game');
    metrics.wsDisconnected('game');
    metrics.gameFinished({ resultReason: 'CHECKMATE' });
    metrics.gameFinished({});
    metrics.pushResult('sent');
    metrics.pushResult('invalid-token', 0); // ignoré

    const text = await metrics.render();
    expect(text).toContain('chess_api_ws_connections{namespace="game"} 1');
    expect(text).toContain('chess_api_games_finished_total{reason="CHECKMATE"} 1');
    expect(text).toContain('chess_api_games_finished_total{reason="UNKNOWN"} 1');
    expect(text).toContain('chess_api_push_notifications_total{result="sent"} 1');
    expect(text).not.toContain('result="invalid-token"');
  });

  it('routeTemplate : baseUrl + chemin, « unmatched » sans route', () => {
    expect(routeTemplate({ baseUrl: '/api/v1', route: { path: '/users/:id' } } as any)).toBe('/api/v1/users/:id');
    expect(routeTemplate({ baseUrl: '', route: undefined } as any)).toBe('unmatched');
  });
});
