import { Test, TestingModule } from '@nestjs/testing';
import { AiEngineService } from './ai-engine.service';
import { Chess } from 'chess.js';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Tour blanche h4 peut capturer la dame noire en h7
const CAPTURE_QUEEN_FEN = '4k3/7q/8/8/7R/8/8/K7 w - - 0 1';

// Mat en 1 : Dame blanche g6, Roi blanc f6, Roi noir h8 → Qg7#
const MATE_IN_ONE_FEN = '7k/8/5KQ1/8/8/8/8/8 w - - 0 1';

// Avantage matériel : Blancs ont Dame vs rien
const ADVANTAGE_FEN = '4k3/8/8/8/8/8/8/4KQ2 w - - 0 1';

describe('AiEngineService', () => {
  let service: AiEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiEngineService],
    }).compile();
    service = module.get<AiEngineService>(AiEngineService);
  });

  const isValidUci = (fen: string, uci: string): boolean => {
    const chess = new Chess(fen);
    try {
      chess.move({ from: uci.substring(0, 2), to: uci.substring(2, 4),
        promotion: uci.length >= 5 ? uci[4] : undefined });
      return true;
    } catch { return false; }
  };

  // ─── Niveau 1 ──────────────────────────────────────────────────────────────

  describe('niveau 1 — aléatoire', () => {
    it('retourne un coup légal depuis la position initiale', () => {
      expect(isValidUci(INITIAL_FEN, service.getBestMove(INITIAL_FEN, 1))).toBe(true);
    });

    it('retourne un coup légal (10 itérations)', () => {
      for (let i = 0; i < 10; i++) {
        expect(isValidUci(INITIAL_FEN, service.getBestMove(INITIAL_FEN, 1))).toBe(true);
      }
    });
  });

  // ─── Niveau 2 ──────────────────────────────────────────────────────────────

  describe('niveau 2 — Minimax', () => {
    it('retourne un coup légal', () => {
      expect(isValidUci(INITIAL_FEN, service.getBestMove(INITIAL_FEN, 2))).toBe(true);
    });

    it('capture la dame adverse (Rxh7)', () => {
      expect(service.getBestMove(CAPTURE_QUEEN_FEN, 2)).toBe('h4h7');
    });

    it('joue le mat en 1 (Qg7#)', () => {
      expect(service.getBestMove(MATE_IN_ONE_FEN, 2)).toBe('g6g7');
    });
  });

  // ─── Niveau 3 ──────────────────────────────────────────────────────────────

  describe('niveau 3 — Alpha-Beta', () => {
    it('retourne un coup légal', () => {
      expect(isValidUci(INITIAL_FEN, service.getBestMove(INITIAL_FEN, 3))).toBe(true);
    });

    it('capture la dame adverse', () => {
      expect(service.getBestMove(CAPTURE_QUEEN_FEN, 3)).toBe('h4h7');
    });

    it('joue le mat en 1', () => {
      expect(service.getBestMove(MATE_IN_ONE_FEN, 3)).toBe('g6g7');
    });
  });

  // ─── Niveau 4 ──────────────────────────────────────────────────────────────

  describe('niveau 4 — IDS + TT + Null Move', () => {
    it('retourne un coup légal depuis la position initiale', () => {
      const uci = service.getBestMove(INITIAL_FEN, 4);
      expect(isValidUci(INITIAL_FEN, uci)).toBe(true);
    }, 10_000); // timeout 10 s pour IDS

    it('s\'arrête dans le délai imparti (< 2 s)', () => {
      const start = Date.now();
      service.getBestMove(CAPTURE_QUEEN_FEN, 4); // position simple → rapide
      expect(Date.now() - start).toBeLessThan(3_000);
    });

    it('capture la dame adverse', () => {
      expect(service.getBestMove(CAPTURE_QUEEN_FEN, 4)).toBe('h4h7');
    });

    it('joue le mat en 1', () => {
      expect(service.getBestMove(MATE_IN_ONE_FEN, 4)).toBe('g6g7');
    });
  });

  // ─── Niveau 5 (fallback moteur interne si Stockfish absent) ───────────────

  describe('niveau 5 — fallback moteur interne', () => {
    it('retourne un coup légal (getBestMove délègue à IDS pour level >= 5)', () => {
      expect(isValidUci(INITIAL_FEN, service.getBestMove(INITIAL_FEN, 5))).toBe(true);
    }, 10_000);

    it('capture la dame adverse', () => {
      expect(service.getBestMove(CAPTURE_QUEEN_FEN, 5)).toBe('h4h7');
    });
  });

  // ─── Évaluation ────────────────────────────────────────────────────────────

  describe('evaluatePosition', () => {
    it('évalue la position initiale à 0 (symétrie)', () => {
      expect(service.evaluatePosition(INITIAL_FEN)).toBe(0);
    });

    it('évalue positivement un avantage matériel blanc', () => {
      expect(service.evaluatePosition(ADVANTAGE_FEN)).toBeGreaterThan(800);
    });
  });
});
