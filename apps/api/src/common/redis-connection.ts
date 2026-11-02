// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Options de connexion BullMQ à partir de REDIS_URL
//
// Avant : seuls l'hôte et le port étaient extraits de l'URL ; le mot de passe
// (redis://:secret@redis:6379) était perdu et BullMQ échouait (NOAUTH) dès que
// Redis exigeait une authentification, comme dans le chart Helm.
// Gère aussi l'utilisateur ACL, le numéro de base (/1) et TLS (rediss://).
// ─────────────────────────────────────────────────────────────────────────────
import type { RedisOptions } from 'ioredis';

export function redisConnection(url = process.env.REDIS_URL ?? 'redis://localhost:6379'): RedisOptions {
  const u = new URL(url);
  const db = Number(u.pathname.replace('/', '') || 0);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(Number.isInteger(db) && db > 0 ? { db } : {}),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
