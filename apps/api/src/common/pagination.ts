// ─────────────────────────────────────────────────────────────────────────────
// Sprint 21 — Pagination des listes (classement, notifications)
//
// Avant : ?pageSize=1000000 chargeait toute la table, et ?page=0 ou une valeur
// non numérique produisait un « skip » négatif ou NaN → erreur 500 de Prisma.
// ─────────────────────────────────────────────────────────────────────────────
export const MAX_PAGE_SIZE = 50;

export interface Page {
  page: number;
  pageSize: number;
  skip: number;
}

/** Lit page / pageSize (chaînes de requête) en valeurs sûres. */
export function parsePage(page?: string | number, pageSize?: string | number, defaultSize = 20): Page {
  const p = clampInt(page, 1, 10_000, 1);
  const size = clampInt(pageSize, 1, MAX_PAGE_SIZE, defaultSize);
  return { page: p, pageSize: size, skip: (p - 1) * size };
}

function clampInt(value: string | number | undefined, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : parseInt(value ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}
