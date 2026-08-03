/**
 * Service IA — niveaux 1 à 3 (Sprint 3).
 * Niveaux 4-5 (Stockfish + BullMQ) arriveront au Sprint 4.
 *
 * Niveaux :
 *   1 — Coup aléatoire valide
 *   2 — Minimax profondeur 2
 *   3 — Alpha-Beta élagage profondeur 3
 */

import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { evaluate } from './evaluation';

const DEPTH_BY_LEVEL: Record<number, number> = {
  1: 0,  // aléatoire, pas de recherche
  2: 2,  // Minimax
  3: 3,  // Alpha-Beta
};

@Injectable()
export class AiService {
  // ─── Point d'entrée ─────────────────────────────────────────────────────────

  /**
   * Retourne le meilleur coup UCI pour [fen] selon [level].
   * Toujours synchrone pour les niveaux 1-3 (chess.js pur).
   */
  getBestMove(fen: string, level: number): string {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });

    if (moves.length === 0) return '';

    const depth = DEPTH_BY_LEVEL[level] ?? DEPTH_BY_LEVEL[1];

    switch (level) {
      case 1:
        return this.pickRandom(moves);
      case 2:
        return this.minimaxRoot(chess, depth);
      case 3:
      default:
        return this.alphaBetaRoot(chess, depth);
    }
  }

  // ─── Niveau 1 : aléatoire ────────────────────────────────────────────────────

  private pickRandom(moves: ReturnType<Chess['moves']>): string {
    const m = moves[Math.floor(Math.random() * moves.length)] as any;
    return `${m.from}${m.to}${m.promotion ?? ''}`;
  }

  // ─── Niveau 2 : Minimax ──────────────────────────────────────────────────────

  private minimaxRoot(chess: Chess, depth: number): string {
    const moves = chess.moves({ verbose: true });
    const isMax = chess.turn() === 'w'; // blanc maximise, noir minimise
    let bestScore = isMax ? -Infinity : Infinity;
    let bestMove = moves[0] as any;

    for (const move of moves) {
      chess.move(move as any);
      const score = this.minimax(chess, depth - 1, !isMax);
      chess.undo();

      if (isMax ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return `${bestMove.from}${bestMove.to}${bestMove.promotion ?? ''}`;
  }

  private minimax(chess: Chess, depth: number, isMax: boolean): number {
    if (depth === 0 || chess.isGameOver()) return evaluate(chess);

    const moves = chess.moves();
    if (isMax) {
      let best = -Infinity;
      for (const move of moves) {
        chess.move(move);
        best = Math.max(best, this.minimax(chess, depth - 1, false));
        chess.undo();
      }
      return best;
    } else {
      let best = Infinity;
      for (const move of moves) {
        chess.move(move);
        best = Math.min(best, this.minimax(chess, depth - 1, true));
        chess.undo();
      }
      return best;
    }
  }

  // ─── Niveau 3 : Alpha-Beta pruning ──────────────────────────────────────────

  private alphaBetaRoot(chess: Chess, depth: number): string {
    const moves = chess.moves({ verbose: true });
    const isMax = chess.turn() === 'w';
    let bestScore = isMax ? -Infinity : Infinity;
    let bestMove = moves[0] as any;

    for (const move of moves) {
      chess.move(move as any);
      const score = this.alphaBeta(chess, depth - 1, -Infinity, Infinity, !isMax);
      chess.undo();

      if (isMax ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }

    return `${bestMove.from}${bestMove.to}${bestMove.promotion ?? ''}`;
  }

  private alphaBeta(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    isMax: boolean,
  ): number {
    if (depth === 0 || chess.isGameOver()) return evaluate(chess);

    const moves = chess.moves();

    if (isMax) {
      let value = -Infinity;
      for (const move of moves) {
        chess.move(move);
        value = Math.max(value, this.alphaBeta(chess, depth - 1, alpha, beta, false));
        chess.undo();
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break; // coupure β
      }
      return value;
    } else {
      let value = Infinity;
      for (const move of moves) {
        chess.move(move);
        value = Math.min(value, this.alphaBeta(chess, depth - 1, alpha, beta, true));
        chess.undo();
        beta = Math.min(beta, value);
        if (beta <= alpha) break; // coupure α
      }
      return value;
    }
  }
}
