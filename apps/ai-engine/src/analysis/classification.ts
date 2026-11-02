// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Classification des coups fondée sur la probabilité de gain
//
// Avant : seuils fixes en centipions (imprécision dès 20 cp, gaffe au-delà de
// 100 cp) et « théorie » pour les 10 premiers demi-coups quoi qu'il arrive.
// Résultat : presque chaque coup était marqué, une perte de 300 cp à +15
// comptait comme une gaffe, et une gaffe d'ouverture passait inaperçue.
//
// Désormais (méthode Lichess) : on mesure la baisse de probabilité de gain
// du joueur, ce qui pondère naturellement l'enjeu de la position.
// ─────────────────────────────────────────────────────────────────────────────

export type Classification =
  | 'book' | 'brilliant' | 'best'
  | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Centipions (point de vue du joueur) → probabilité de gain 0–100. */
export function winPercent(cp: number): number {
  const clamped = Math.max(-10_000, Math.min(10_000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/** Seuils de baisse de probabilité de gain (points de pourcentage). */
export const THRESHOLDS = { inaccuracy: 10, mistake: 20, blunder: 30 } as const;

/** Demi-coups considérés comme ouverture (« théorie » si le coup est sain). */
export const BOOK_PLIES = 8;

/**
 * @param bestEvalCp   évaluation (joueur) si le meilleur coup avait été joué
 * @param playedEvalCp évaluation (joueur) après le coup réellement joué
 */
export function classifyMove(params: {
  bestEvalCp: number;
  playedEvalCp: number;
  isBestMove: boolean;
  ply: number;
}): Classification {
  const drop = Math.max(0, winPercent(params.bestEvalCp) - winPercent(params.playedEvalCp));

  if (drop >= THRESHOLDS.blunder) return 'blunder';
  if (drop >= THRESHOLDS.mistake) return 'mistake';
  if (drop >= THRESHOLDS.inaccuracy) return 'inaccuracy';
  // Ouverture : seulement les coups sains (une gaffe reste une gaffe).
  if (params.ply <= BOOK_PLIES) return 'book';
  if (params.isBestMove) return 'best';
  return 'good';
}
