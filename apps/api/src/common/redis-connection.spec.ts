// Sprint 19 — Analyse de REDIS_URL pour BullMQ
import { redisConnection } from './redis-connection';

describe('redisConnection', () => {
  it('hôte et port par défaut', () => {
    expect(redisConnection('redis://redis')).toEqual({ host: 'redis', port: 6379 });
  });

  it('mot de passe, utilisateur ACL et base', () => {
    expect(redisConnection('redis://chess:p%40ss@cache:6380/2')).toEqual({
      host: 'cache', port: 6380, username: 'chess', password: 'p@ss', db: 2,
    });
  });

  it('mot de passe seul et TLS (rediss://)', () => {
    expect(redisConnection('rediss://:secret@r.example.com')).toEqual({
      host: 'r.example.com', port: 6379, password: 'secret', tls: {},
    });
  });
});
