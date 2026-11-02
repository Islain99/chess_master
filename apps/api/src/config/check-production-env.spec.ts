// Sprint 19 — Garde-fou de démarrage en production
import { assertProductionEnv, productionEnvProblems } from './check-production-env';

const OK = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  DATABASE_URL: 'postgresql://a:b@db/c',
  REDIS_URL: 'redis://r',
};

describe('productionEnvProblems', () => {
  it('hors production : aucune exigence', () => {
    expect(productionEnvProblems({ NODE_ENV: 'development' })).toEqual([]);
  });

  it('production correctement configurée', () => {
    expect(() => assertProductionEnv(OK)).not.toThrow();
  });

  it.each(['', 'change-me', 'CHANGE_ME_IN_PROD'])('refuse le secret JWT « %s »', (secret) => {
    expect(() => assertProductionEnv({ ...OK, JWT_ACCESS_SECRET: secret })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('refuse un secret trop court et signale Redis / base manquants', () => {
    const problems = productionEnvProblems({ NODE_ENV: 'production', JWT_ACCESS_SECRET: 'court' });
    expect(problems).toHaveLength(3);
  });
});
