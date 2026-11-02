// ─────────────────────────────────────────────────────────────────────────────
// Sprint 19 — Garde-fou de démarrage en production
//
// AuthModule et JwtStrategy retombent sur le secret 'change-me' si
// JWT_ACCESS_SECRET est absent : en production, n'importe qui pourrait alors
// forger un jeton valide. On refuse de démarrer plutôt que de tourner ainsi.
// ─────────────────────────────────────────────────────────────────────────────
const WEAK_SECRETS = new Set(['change-me', 'change-me-too', 'CHANGE_ME_IN_PROD', 'secret']);

/** Renvoie la liste des problèmes (vide = configuration acceptable). */
export function productionEnvProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (env.NODE_ENV !== 'production') return [];
  const problems: string[] = [];
  const secret = env.JWT_ACCESS_SECRET ?? '';
  if (!secret || WEAK_SECRETS.has(secret)) {
    problems.push('JWT_ACCESS_SECRET absent ou laissé à sa valeur d\'exemple');
  } else if (secret.length < 32) {
    problems.push('JWT_ACCESS_SECRET trop court (32 caractères minimum)');
  }
  if (!env.DATABASE_URL) problems.push('DATABASE_URL absent');
  if (!env.REDIS_URL) problems.push('REDIS_URL absent (requis pour plusieurs réplicas)');
  return problems;
}

export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems = productionEnvProblems(env);
  if (problems.length > 0) {
    throw new Error(`Configuration de production invalide :\n  - ${problems.join('\n  - ')}`);
  }
}
