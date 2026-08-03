import { Injectable } from '@nestjs/common';
import { Chess, Color, PieceSymbol } from 'chess.js';
import { TranspositionTable, TTEntry, TTFlag, TT_FLAG } from './transposition-table';

// ─── Valeurs des pièces (centipions) ─────────────────────────────────────────

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100, n: 320, b: 330, r: 500, q: 900, k: 20_000,
};

const MATE_SCORE = 100_000;

// ─── Tables pièce-case (PST) ──────────────────────────────────────────────────
// Index 0 = a8, index 63 = h1 (vue des blancs, rang 8 en premier)

const PST: Record<PieceSymbol, number[]> = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

@Injectable()
export class AiEngineService {
  /**
   * Retourne le meilleur coup UCI pour le joueur au trait.
   * Niveaux 1-4 uniquement (5 = Stockfish, géré séparément dans GamesService).
   */
  getBestMove(fen: string, level: number): string {
    switch (level) {
      case 1:  return this.randomMove(fen);
      case 2:  return this.negamaxMove(fen, 2);
      case 3:  return this.alphaBetaMove(fen, 4);
      case 4:
      default: return this.iterativeDeepeningMove(fen); // niveaux >= 4 → IDS (5 = Stockfish externe)
    }
  }

  // ──────────────────────────────────────────────
  // Niveau 1 : aléatoire
  // ──────────────────────────────────────────────

  private randomMove(fen: string): string {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    const pick = moves[Math.floor(Math.random() * moves.length)];
    return `${pick.from}${pick.to}${pick.promotion ?? ''}`;
  }

  // ──────────────────────────────────────────────
  // Niveau 2 : Negamax profondeur 2
  // ──────────────────────────────────────────────

  private negamaxMove(fen: string, depth: number): string {
    const chess = new Chess(fen);
    const moves = chess.moves({ verbose: true });
    let best = moves[0];
    let bestScore = -Infinity;

    for (const move of moves) {
      chess.move(move);
      const score = -this.negamax(chess, depth - 1);
      chess.undo();
      if (score > bestScore) { bestScore = score; best = move; }
    }
    return `${best.from}${best.to}${best.promotion ?? ''}`;
  }

  private negamax(chess: Chess, depth: number): number {
    if (depth === 0 || chess.isGameOver()) return this.evaluate(chess);
    let best = -Infinity;
    for (const move of chess.moves({ verbose: true })) {
      chess.move(move);
      const score = -this.negamax(chess, depth - 1);
      chess.undo();
      if (score > best) best = score;
    }
    return best;
  }

  // ──────────────────────────────────────────────
  // Niveau 3 : Alpha-Beta profondeur 4
  // ──────────────────────────────────────────────

  private alphaBetaMove(fen: string, depth: number): string {
    const chess = new Chess(fen);
    const moves = this.orderMoves(chess.moves({ verbose: true }));
    let best = moves[0];
    let bestScore = -Infinity;
    let alpha = -Infinity;

    for (const move of moves) {
      chess.move(move);
      const score = -this.alphaBeta(chess, depth - 1, -Infinity, -alpha);
      chess.undo();
      if (score > bestScore) { bestScore = score; best = move; }
      if (score > alpha) alpha = score;
    }
    return `${best.from}${best.to}${best.promotion ?? ''}`;
  }

  private alphaBeta(chess: Chess, depth: number, alpha: number, beta: number): number {
    if (depth === 0 || chess.isGameOver()) return this.evaluate(chess);
    for (const move of this.orderMoves(chess.moves({ verbose: true }))) {
      chess.move(move);
      const score = -this.alphaBeta(chess, depth - 1, -beta, -alpha);
      chess.undo();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  // ──────────────────────────────────────────────
  // Niveau 4 : Iterative Deepening + TT + Null Move
  // ──────────────────────────────────────────────

  private iterativeDeepeningMove(fen: string, timeLimitMs = 1_500): string {
    const chess = new Chess(fen);
    const tt = new TranspositionTable();
    let moves = this.orderMoves(chess.moves({ verbose: true }));
    let bestMove = moves[0];
    const deadline = Date.now() + timeLimitMs;

    for (let depth = 1; depth <= 10; depth++) {
      if (Date.now() >= deadline) break; // temps écoulé → conserver le meilleur coup actuel

      let bestScore = -Infinity;
      let alpha = -Infinity;
      const beta = Infinity;
      let depthBest = bestMove;

      for (const move of moves) {
        if (Date.now() >= deadline) break; // coupure temporelle dans la boucle extérieure
        chess.move(move);
        const score = -this.alphaBetaTT(chess, depth - 1, -beta, -alpha, tt, deadline);
        chess.undo();

        if (score > bestScore) { bestScore = score; depthBest = move; }
        if (score > alpha) alpha = score;
      }

      bestMove = depthBest;
      // Triangulation : meilleur coup en tête pour améliorer le tri à la prochaine itération
      moves = [bestMove, ...moves.filter((m) => m !== bestMove)];
    }

    return `${bestMove.from}${bestMove.to}${bestMove.promotion ?? ''}`;
  }

  private alphaBetaTT(
    chess: Chess,
    depth: number,
    alpha: number,
    beta: number,
    tt: TranspositionTable,
    deadline = Infinity,
  ): number {
    if (Date.now() >= deadline) return this.evaluate(chess); // coupure temporelle
    const key = chess.fen();

    // Consultation de la table de transposition
    const entry: TTEntry | undefined = tt.get(key);
    if (entry && entry.depth >= depth) {
      if (entry.flag === TT_FLAG.EXACT)  return entry.score;
      if (entry.flag === TT_FLAG.LOWER)  alpha = Math.max(alpha, entry.score);
      if (entry.flag === TT_FLAG.UPPER)  beta  = Math.min(beta,  entry.score);
      if (alpha >= beta) return entry.score;
    }

    if (depth === 0 || chess.isGameOver()) {
      return this.evaluate(chess);
    }

    // ─── Null Move Pruning (R = 2) ──────────────────────────────────────────
    // Sauter le tour du joueur courant : si l'adversaire ne peut pas améliorer
    // suffisamment son score même avec un coup gratuit, on coupe.
    if (depth >= 3 && !chess.inCheck() && this.hasNonPawnMaterial(chess)) {
      const nullChess = this.makeNullMove(chess);
      if (nullChess) {
        const nullScore = -this.alphaBetaTT(nullChess, depth - 1 - 2, -beta, -beta + 1, tt, deadline);
        if (nullScore >= beta) return beta; // coupure null move
      }
    }

    const moves = this.orderMovesWithTT(chess.moves({ verbose: true }), entry);
    let bestScore = -Infinity;
    let bestMoveUci = `${moves[0].from}${moves[0].to}${moves[0].promotion ?? ''}`;
    let flag: TTFlag = TT_FLAG.UPPER;

    for (const move of moves) {
      chess.move(move);
      const score = -this.alphaBetaTT(chess, depth - 1, -beta, -alpha, tt, deadline);
      chess.undo();

      if (score > bestScore) {
        bestScore = score;
        bestMoveUci = `${move.from}${move.to}${move.promotion ?? ''}`;
      }
      if (score > alpha) {
        alpha = score;
        flag = TT_FLAG.EXACT;
      }
      if (alpha >= beta) {
        flag = TT_FLAG.LOWER;
        break;
      }
    }

    tt.set(key, { depth, score: bestScore, flag, bestMove: bestMoveUci });
    return bestScore;
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /** Crée un coup nul en inversant le joueur au trait dans le FEN. */
  private makeNullMove(chess: Chess): Chess | null {
    try {
      const parts = chess.fen().split(' ');
      parts[1] = parts[1] === 'w' ? 'b' : 'w';
      parts[3] = '-'; // supprimer la cible en passant
      if (parts[1] === 'w') parts[5] = String(parseInt(parts[5]) + 1);
      return new Chess(parts.join(' '));
    } catch {
      return null; // FEN invalide après inversion (ne devrait pas arriver)
    }
  }

  /** Vérifie qu'il reste des pièces non-pion non-roi au joueur au trait. */
  private hasNonPawnMaterial(chess: Chess): boolean {
    const turn = chess.turn();
    return chess.board().flat().some(
      (p) => p && p.color === turn && p.type !== 'p' && p.type !== 'k',
    );
  }

  /** Tri MVV-LVA (captures en premier, puis pion-capture-pion, etc.) */
  private orderMoves(moves: ReturnType<Chess['moves']>): typeof moves {
    return moves.sort((a: any, b: any) => {
      const s = (m: any) =>
        (m.captured ? PIECE_VALUES[m.captured as PieceSymbol] -
          PIECE_VALUES[m.piece as PieceSymbol] / 10 : 0) +
        (m.promotion ? PIECE_VALUES[m.promotion as PieceSymbol] : 0);
      return s(b) - s(a);
    });
  }

  /** Comme orderMoves, mais place en tête le meilleur coup de la TT si présent. */
  private orderMovesWithTT(
    moves: ReturnType<Chess['moves']>,
    entry?: TTEntry,
  ): typeof moves {
    const sorted = this.orderMoves(moves);
    if (!entry?.bestMove) return sorted;
    return [
      ...sorted.filter((m: any) => `${m.from}${m.to}${m.promotion ?? ''}` === entry.bestMove),
      ...sorted.filter((m: any) => `${m.from}${m.to}${m.promotion ?? ''}` !== entry.bestMove),
    ];
  }

  /** Évaluation statique (perspective du joueur au trait, en centipions). */
  private evaluate(chess: Chess): number {
    if (chess.isCheckmate()) return -MATE_SCORE;
    if (chess.isDraw())       return 0;

    let score = 0;
    const board = chess.board();

    for (let ri = 0; ri < 8; ri++) {
      for (let fi = 0; fi < 8; fi++) {
        const piece = board[ri][fi];
        if (!piece) continue;
        const value = PIECE_VALUES[piece.type];
        const pstIdx =
          (piece.color as Color) === 'w' ? ri * 8 + fi : (7 - ri) * 8 + fi;
        const pst = PST[piece.type][pstIdx];
        score += piece.color === 'w' ? value + pst : -(value + pst);
      }
    }

    return chess.turn() === 'w' ? score : -score;
  }

  /** Indice PST : 0 = a8 (vue blancs). Miroir vertical pour les noirs. */
  evaluatePosition(fen: string): number {
    return this.evaluate(new Chess(fen));
  }
}
