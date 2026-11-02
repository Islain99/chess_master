// ─────────────────────────────────────────────────────────────────────────────
// E2E — Socle HTTP : santé, métriques, format d'erreur, en-têtes de sécurité
// Sprint 20 : application démarrée comme en production (configureApp).
// ─────────────────────────────────────────────────────────────────────────────
import { RunningApp, startApp } from './e2e-utils';

describe('Socle HTTP (e2e)', () => {
  let target: RunningApp;

  beforeAll(async () => {
    target = await startApp();
  });

  afterAll(() => target?.close());

  it('GET /api/v1/health → ok', async () => {
    const res = await target.api().get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/v1/health/ready → base de données joignable', async () => {
    const res = await target.api().get('/api/v1/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ready', database: 'ok' });
  });

  it('GET /metrics hors préfixe, format Prometheus', async () => {
    const res = await target.api().get('/metrics').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('chess_api_http_requests_total');
  });

  it('route inconnue → 404 au format d\'erreur commun', async () => {
    const res = await target.api().get('/api/v1/nexiste-pas').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, path: '/api/v1/nexiste-pas' });
  });

  it('en-têtes de sécurité Helmet présents', async () => {
    const res = await target.api().get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('CORS : pré-requête acceptée pour un client Web d\'une autre origine', async () => {
    const res = await target
      .api()
      .options('/api/v1/auth/login')
      .set('Origin', 'https://chess.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    // CORS_ORIGIN absent ou « * » : l'origine est renvoyée (sprint 20)
    expect(res.headers['access-control-allow-origin']).toBe('https://chess.example.com');
  });
});
