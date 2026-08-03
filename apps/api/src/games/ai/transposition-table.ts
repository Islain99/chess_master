/**
 * Table de transposition pour le moteur IA de niveau 4.
 *
 * Associe un hash de position (ici la chaîne FEN) à un résultat de recherche :
 * score, profondeur, flag (EXACT / LOWER / UPPER) et meilleur coup.
 * Cela évite de recalculer une même position atteinte par des chemins différents.
 */

export const TT_FLAG = {
  EXACT: 'EXACT',   // nœud PV : score exact
  LOWER: 'LOWER',   // nœud de coupure bêta : borne inférieure
  UPPER: 'UPPER',   // nœud alpha (tous les enfants < alpha) : borne supérieure
} as const;

export type TTFlag = typeof TT_FLAG[keyof typeof TT_FLAG];

export interface TTEntry {
  depth: number;   // profondeur à laquelle l'entrée a été calculée
  score: number;   // score en centipions (perspective du joueur au trait)
  flag: TTFlag;
  bestMove: string; // meilleur coup UCI trouvé à cette profondeur
}

/**
 * Table de transposition simple avec éviction LRU basique.
 * Pour une performance maximale en production, remplacer par une table
 * de taille fixe avec adressage par modulo (Zobrist hash % SIZE).
 */
export class TranspositionTable {
  private readonly entries = new Map<string, TTEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 200_000) {
    this.maxSize = maxSize;
  }

  get(key: string): TTEntry | undefined {
    return this.entries.get(key);
  }

  set(key: string, entry: TTEntry): void {
    if (this.entries.size >= this.maxSize) {
      // Éviction simple : supprimer les 20 % les plus anciens
      const toDelete = [...this.entries.keys()].slice(0, this.maxSize * 0.2);
      for (const k of toDelete) this.entries.delete(k);
    }
    this.entries.set(key, entry);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
