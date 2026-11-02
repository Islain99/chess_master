// ─────────────────────────────────────────────────────────────────────────────
// Sprint 13 — Tests unitaires de BoardPosition (parsing FEN côté client)
//
// BoardPosition est la seule source de vérité de l'affichage du plateau :
// une erreur de parsing FEN décale toutes les pièces. On vérifie ici la
// position initiale, une position après 1.e4, les champs optionnels et la
// construction de la table des coups légaux.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/features/board/models/board_position.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('BoardPosition.fromFen', () {
    test('position initiale : 32 pièces aux bonnes cases', () {
      final pos = BoardPosition.initial();

      expect(pos.pieces.length, 32);
      expect(pos.pieceAt('e1'), 'wK');
      expect(pos.pieceAt('d1'), 'wQ');
      expect(pos.pieceAt('e8'), 'bK');
      expect(pos.pieceAt('d8'), 'bQ');
      expect(pos.pieceAt('a1'), 'wR');
      expect(pos.pieceAt('h8'), 'bR');
      expect(pos.pieceAt('g1'), 'wN');
      expect(pos.pieceAt('c8'), 'bB');
      // Rangées de pions complètes
      for (final file in 'abcdefgh'.split('')) {
        expect(pos.pieceAt('${file}2'), 'wP', reason: '${file}2');
        expect(pos.pieceAt('${file}7'), 'bP', reason: '${file}7');
      }
      // Centre vide
      expect(pos.pieceAt('e4'), isNull);
    });

    test('position initiale : champs de trait, roques et compteurs', () {
      final pos = BoardPosition.initial();

      expect(pos.activeColor, 'w');
      expect(pos.castling, 'KQkq');
      expect(pos.enPassant, '-');
      expect(pos.halfmoveClock, 0);
      expect(pos.fullmoveNumber, 1);
    });

    test('après 1.e4 : pion déplacé, trait aux noirs, case en passant', () {
      final pos = BoardPosition.fromFen(
        'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      );

      expect(pos.pieceAt('e4'), 'wP');
      expect(pos.pieceAt('e2'), isNull);
      expect(pos.activeColor, 'b');
      expect(pos.enPassant, 'e3');
      expect(pos.pieces.length, 32);
    });

    test('compteurs de demi-coups et numéro de coup lus correctement', () {
      final pos = BoardPosition.fromFen('8/8/8/4k3/8/8/8/4K3 w - - 37 82');

      expect(pos.pieces, {'e5': 'bK', 'e1': 'wK'});
      expect(pos.castling, '-');
      expect(pos.halfmoveClock, 37);
      expect(pos.fullmoveNumber, 82);
    });

    test('FEN partiel (placement seul) : valeurs par défaut appliquées', () {
      final pos = BoardPosition.fromFen('8/8/8/8/8/8/8/K7');

      expect(pos.pieces, {'a1': 'wK'});
      expect(pos.activeColor, 'w');
      expect(pos.castling, 'KQkq');
      expect(pos.enPassant, '-');
      expect(pos.halfmoveClock, 0);
      expect(pos.fullmoveNumber, 1);
    });

    test('compteurs non numériques : repli sur 0 et 1', () {
      final pos = BoardPosition.fromFen('8/8/8/8/8/8/8/K7 w - - x y');

      expect(pos.halfmoveClock, 0);
      expect(pos.fullmoveNumber, 1);
    });

    test('espaces superflus ignorés', () {
      final pos = BoardPosition.fromFen('  ${BoardPosition.initialFen}  ');

      expect(pos.pieces.length, 32);
      expect(pos.fullmoveNumber, 1);
    });
  });

  group('BoardPosition.buildMoveMap', () {
    test('regroupe les destinations par case de départ', () {
      final map = BoardPosition.buildMoveMap(['e2e4', 'e2e3', 'g1f3', 'g1h3']);

      expect(map.keys, unorderedEquals(['e2', 'g1']));
      expect(map['e2'], {'e4', 'e3'});
      expect(map['g1'], {'f3', 'h3'});
    });

    test('promotion : la pièce promue est ignorée, une seule destination', () {
      final map = BoardPosition.buildMoveMap(['e7e8q', 'e7e8r', 'e7e8b', 'e7e8n']);

      expect(map, {'e7': {'e8'}});
    });

    test('entrées trop courtes ignorées', () {
      final map = BoardPosition.buildMoveMap(['', 'e2', 'e2e', 'd2d4']);

      expect(map, {'d2': {'d4'}});
    });

    test('liste vide → table vide', () {
      expect(BoardPosition.buildMoveMap(const []), isEmpty);
    });
  });
}
