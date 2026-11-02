// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Configuration HTTP / WebSocket de l'application
//
// Extraite de main.ts pour que les tests end-to-end démarrent EXACTEMENT la
// même application que la production (préfixe, validation, filtre d'erreurs,
// Helmet, CORS, adaptateur Socket.IO Redis…) au lieu d'une copie approchée.
// ─────────────────────────────────────────────────────────────────────────────
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { GlobalExceptionFilter } from './common/global-exception.filter';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

/**
 * CORS_ORIGIN : liste d'origines séparées par des virgules. Absente, vide ou
 * « * » → toute origine (renvoyée telle quelle, compatible avec credentials).
 *
 * Sprint 20 : « * » (valeur de .env.example et de Docker Compose) était passé
 * au module cors comme une origine LITTÉRALE ; aucun navigateur n'envoie
 * « Origin: * », donc aucune requête cross-origin n'était autorisée — le
 * client Web servi sur :8080 ne pouvait pas appeler l'API sur :3000.
 */
export function corsOrigin(value: string | undefined): true | string[] {
  const origins = (value ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  return origins.length === 0 || origins.includes('*') ? true : origins;
}

export async function configureApp(
  app: NestExpressApplication,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  // Sprint 19 : derrière un ingress / reverse proxy, l'IP du client est dans
  // X-Forwarded-For. Sans cela, la limitation de débit (Throttler) voyait
  // TOUTES les requêtes venir de l'ingress et bloquait tout le monde ensemble.
  // TRUST_PROXY = nombre de proxys de confiance (1 pour un ingress NGINX).
  const trustProxy = Number(env.TRUST_PROXY ?? 0);
  if (trustProxy > 0) app.set('trust proxy', trustProxy);

  app.use(helmet());
  app.enableCors({ origin: corsOrigin(env.CORS_ORIGIN), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  // Sprint 19 : /metrics reste hors préfixe (convention Prometheus) et n'est
  // pas routé par l'ingress (accessible uniquement dans le cluster).
  app.setGlobalPrefix('api/v1', { exclude: [{ path: 'metrics', method: RequestMethod.GET }] });

  // Sprint 19 : Socket.IO partagé entre réplicas via Redis.
  if (env.REDIS_URL) {
    const adapter = new RedisIoAdapter(app);
    await adapter.connectToRedis(env.REDIS_URL);
    app.useWebSocketAdapter(adapter);
  }

  // Sprint 19 : arrêt propre sur SIGTERM (déploiements progressifs Kubernetes).
  app.enableShutdownHooks();
}
