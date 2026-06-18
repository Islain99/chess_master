import { Test, TestingModule } from '@nestjs/testing';
import { ChessEngineService } from './chess-engine.service';

const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Après 1.f3 e5 2.g4 : trait aux noirs, Qd8-h4# va donner mat aux blancs
const PRE_FOOLSMATE_FEN =
  'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2';

// Mat du berger consommé : trait aux blancs, qui sont en échec et mat
const FOOLSMATE_FEN =
  'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';

// Pat : roi noir en a8, Qb6, Ka1 → Ka8 ne peut aller nulle part
const STALEMATE_FEN = 'k7/8/1Q6/8/8/8/8/K7 b - - 0 1';

// Prise en passant : pion blanc en e5, pion noir vient de f7-f5
const EN_PASSANT_FEN =
  'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';

describe('ChessEngineService', () => {
  let service: ChessEngineService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ChessEngineService],
    }).compile();
    service = module.get<ChessEngineService>(ChessEngineService);
  });

  describe('applyMove', () => {
    it('accepte un coup légal en UCI', () => {
      const r = service.applyMove(INITIAL_FEN, 'e2e4');
      expect(r.valid).toBe(true);
      expect(r.san).toBe('e4');
    });

    it('refuse un coup illégal sans lancer d\'exception', () => {
      const r = service.applyMove(INITIAL_FEN, 'e2e5');
      expect(r.valid).toBe(false);
    });

    it('refuse de déplacer une pièce ennemie', () => {
      const r = service.applyMove(INITIAL_FEN, 'e7e5'); // trait aux blancs
      expect(r.valid).toBe(false);
    });

    it('détecte un simple échec', () => {
      const fen = '4k3/8/8/7Q/8/8/8/4K3 w - - 0 1';
      const r = service.applyMove(fen, 'h5f7'); // Qf7+
      expect(r.valid).toBe(true);
      expect(r.isCheck).toBe(true);
      expect(r.isCheckmate).toBe(false);
    });

    it('détecte l\'échec et mat (mat du berger)', () => {
      const r = service.applyMove(PRE_FOOLSMATE_FEN, 'd8h4'); // Qh4#
      expect(r.valid).toBe(true);
      expect(r.isCheckmate).toBe(true);
    });

    it('gère une promotion en dame', () => {
      const fen = '3k4/4P3/8/8/8/8/8/4K3 w - - 0 1';
      const r = service.applyMove(fen, 'e7e8q');
      expect(r.valid).toBe(true);
      expect(r.isPromotion).toBe(true);
      expect(r.promotionPiece).toBe('q');
    });

    it('gère une promotion en cavalier', () => {
      const fen = '3k4/4P3/8/8/8/8/8/4K3 w - - 0 1';
      const r = service.applyMove(fen, 'e7e8n');
      expect(r.valid).toBe(true);
      expect(r.isPromotion).toBe(true);
      expect(r.promotionPiece).toBe('n');
    });

    it('gère la prise en passant', () => {
      const r = service.applyMove(EN_PASSANT_FEN, 'e5f6');
      expect(r.valid).toBe(true);
      expect(r.isCapture).toBe(true);
    });

    it('gère le roque côté roi', () => {
      const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
      const r = service.applyMove(fen, 'e1g1');
      expect(r.valid).toBe(true);
      expect(r.san).toBe('O-O');
    });
  });

  describe('getStatus', () => {
    it('retourne 20 coups légaux depuis la position initiale', () => {
      const s = service.getStatus(INITIAL_FEN);
      expect(s.isOver).toBe(false);
      expect(s.legalMoves).toHaveLength(20);
    });

    it('détecte le mat et désigne le gagnant (blanc)', () => {
      // FOOLSMATE_FEN : trait aux blancs, mat → gagnant = noir (b)
      const s = service.getStatus(FOOLSMATE_FEN);
      expect(s.isCheckmate).toBe(true);
      expect(s.isOver).toBe(true);
      // turn() = 'w' et isCheckmate → winner = 'b'
      expect(s.winner).toBe('b');
      expect(s.legalMoves).toHaveLength(0);
    });

    it('détecte le pat', () => {
      const s = service.getStatus(STALEMATE_FEN);
      expect(s.isStalemate).toBe(true);
      expect(s.isOver).toBe(true);
      expect(s.isDraw).toBe(true);
      expect(s.winner).toBeNull();
      expect(s.legalMoves).toHaveLength(0);
    });
  });

  describe('validateFen', () => {
    it('valide la position initiale', () => {
      expect(service.validateFen(INITIAL_FEN)).toBe(true);
    });

    it('rejette une chaîne invalide', () => {
      expect(service.validateFen('not-a-fen')).toBe(false);
    });
  });

  describe('activeColor', () => {
    it('retourne "w" en position initiale', () => {
      expect(service.activeColor(INITIAL_FEN)).toBe('w');
    });

    it('retourne "b" après 1.e4', () => {
      const { fenAfter } = service.applyMove(INITIAL_FEN, 'e2e4');
      expect(service.activeColor(fenAfter!)).toBe('b');
    });
  });
});
