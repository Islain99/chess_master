import { Test, TestingModule } from '@nestjs/testing';
import { Chess } from 'chess.js';
import { AiService } from './ai.service';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Position après 1.e4 e5 */
const AFTER_E4_E5 =
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';

/** Pion blanc c4 peut capturer dame noire non défendue en d5 */
const UNDEFENDED_QUEEN_FEN =
  'rnb1kbnr/pppp1ppp/8/3q4/2P5/8/PP1PPPPP/RNBQKBNR w KQkq - 0 1';

/** Pion noir en e5 peut capturer dame blanche non défendue en e4 (trait noirs) */
const BLACK_CAPTURES_QUEEN_FEN =
  'rnb1kbnr/pppp1ppp/8/4p3/3Q4/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1';

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiService],
    }).compile();
    service = module.get<AiService>(AiService);
  });

  // ─── Niveau 1 : aléatoire ────────────────────────────────────────────────────

  describe('niveau 1 — aléatoire', () => {
    it('retourne un coup UCI valide', () => {
      const uci = service.getBestMove(INITIAL_FEN, 1);
      expect(uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    });

    it('retourne un coup légal', () => {
      const uci = service.getBestMove(INITIAL_FEN, 1);
      const chess = new Chess(INITIAL_FEN);
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      expect(() => chess.move({ from, to })).not.toThrow();
    });

    it('varie ses coups sur plusieurs appels', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 30; i++) seen.add(service.getBestMove(INITIAL_FEN, 1));
      expect(seen.size).toBeGreaterThan(2);
    });
  });

  // ─── Niveau 2 : Minimax ──────────────────────────────────────────────────────

  describe('niveau 2 — Minimax', () => {
    it('retourne un coup UCI valide', () => {
      const uci = service.getBestMove(INITIAL_FEN, 2);
      expect(uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    });

    it('capture une dame adverse non défendue (blancs)', () => {
      // c4d5 : pion blanc capture la dame noire non défendue
      const uci = service.getBestMove(UNDEFENDED_QUEEN_FEN, 2);
      expect(uci).toBe('c4d5');
    });

    it('capture une dame adverse non défendue (noirs)', () => {
      // e5e4 : pion noir capture la dame blanche non défendue
      const uci = service.getBestMove(BLACK_CAPTURES_QUEEN_FEN, 2);
      expect(uci).toBe('e5d4');
    });

    it('joue un coup légal en position médiane', () => {
      const uci = service.getBestMove(AFTER_E4_E5, 2);
      const chess = new Chess(AFTER_E4_E5);
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      expect(() => chess.move({ from, to })).not.toThrow();
    });
  });

  // ─── Niveau 3 : Alpha-Beta ───────────────────────────────────────────────────

  describe('niveau 3 — Alpha-Beta', () => {
    it('retourne un coup UCI valide', () => {
      const uci = service.getBestMove(INITIAL_FEN, 3);
      expect(uci).toMatch(/^[a-h][1-8][a-h][1-8][qrbn]?$/);
    });

    it('capture une dame adverse non défendue (blancs)', () => {
      const uci = service.getBestMove(UNDEFENDED_QUEEN_FEN, 3);
      expect(uci).toBe('c4d5');
    });

    it('capture une dame adverse non défendue (noirs)', () => {
      const uci = service.getBestMove(BLACK_CAPTURES_QUEEN_FEN, 3);
      expect(uci).toBe('e5d4');
    });

    it('joue un coup légal en position médiane', () => {
      const uci = service.getBestMove(AFTER_E4_E5, 3);
      const chess = new Chess(AFTER_E4_E5);
      const from = uci.substring(0, 2);
      const to = uci.substring(2, 4);
      expect(() => chess.move({ from, to })).not.toThrow();
    });

    it('retourne une chaîne vide si aucun coup (position mat)', () => {
      // Mat du berger : blancs mat
      const matFen =
        'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
      const uci = service.getBestMove(matFen, 3);
      expect(uci).toBe('');
    });
  });
});
