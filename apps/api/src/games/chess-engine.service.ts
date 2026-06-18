import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';

export interface MoveResult {
  valid: boolean;
  san?: string;
  fenAfter?: string;
  isCheck?: boolean;
  isCheckmate?: boolean;
  isCapture?: boolean;
  isPromotion?: boolean;
  promotionPiece?: string;
}

export interface GameStatus {
  isOver: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  isThreefoldRepetition: boolean;
  isInsufficientMaterial: boolean;
  is50MoveRule: boolean;
  /** 'w' | 'b' | null — null signifie nulle */
  winner: 'w' | 'b' | null;
  /** Coups légaux pour le joueur courant, format UCI (ex. "e2e4", "e7e8q") */
  legalMoves: string[];
}

@Injectable()
export class ChessEngineService {
  /**
   * Valide et applique un coup UCI sur une position FEN.
   * Retourne { valid: false } sans lancer d'exception si le coup est illégal,
   * afin que le contrôleur puisse répondre 422 proprement.
   */
  applyMove(fen: string, uci: string): MoveResult {
    const chess = new Chess(fen);
    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length >= 5 ? uci[4].toLowerCase() : undefined;

    try {
      const move = chess.move({ from, to, promotion });
      return {
        valid: true,
        san: move.san,
        fenAfter: chess.fen(),
        isCheck: chess.inCheck(),
        isCheckmate: chess.isCheckmate(),
        isCapture: move.captured !== undefined,
        isPromotion: move.promotion !== undefined,
        promotionPiece: move.promotion,
      };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Inspecte le statut d'une position FEN et retourne les coups légaux.
   * Appeler APRÈS avoir appliqué le coup (fenAfter).
   */
  getStatus(fen: string): GameStatus {
    const chess = new Chess(fen);

    const isCheckmate = chess.isCheckmate();
    const isStalemate = chess.isStalemate();
    const isThreefold = chess.isThreefoldRepetition();
    const isInsufficient = chess.isInsufficientMaterial();
    const isDraw = chess.isDraw();
    const is50Move = isDraw && !isStalemate && !isThreefold && !isInsufficient;

    const legalMoves = chess.moves({ verbose: true }).map(
      (m) => `${m.from}${m.to}${m.promotion ?? ''}`,
    );

    let winner: 'w' | 'b' | null = null;
    if (isCheckmate) {
      // C'est au tour de X → X est en échec et mat → l'adversaire gagne
      winner = chess.turn() === 'w' ? 'b' : 'w';
    }

    return {
      isOver: chess.isGameOver(),
      isCheckmate,
      isStalemate,
      isDraw,
      isThreefoldRepetition: isThreefold,
      isInsufficientMaterial: isInsufficient,
      is50MoveRule: is50Move,
      winner,
      legalMoves,
    };
  }

  /** Vérifie si une position FEN est valide */
  validateFen(fen: string): boolean {
    try {
      new Chess(fen);
      return true;
    } catch {
      return false;
    }
  }

  /** Retourne la couleur dont c'est le tour ("w" ou "b") */
  activeColor(fen: string): 'w' | 'b' {
    return new Chess(fen).turn();
  }
}
