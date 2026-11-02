// ─────────────────────────────────────────────────────────────────────────────
// Sprint 13 — Tests unitaires de ChessMove (désérialisation des coups serveur)
//
// Chaque coup reçu par REST ou Socket.IO passe par ChessMove.fromJson :
// on vérifie les champs obligatoires, les drapeaux optionnels et les
// accesseurs from/to (y compris pour une promotion).
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/features/board/models/chess_move.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('ChessMove.fromJson', () {
    test('lit tous les champs fournis par le serveur', () {
      final move = ChessMove.fromJson({
        'ply': 5,
        'san': 'Bxf7+',
        'uci': 'c4f7',
        'fenAfter': 'r1bqkbnr/pppp1Bpp/2n5/4p3/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 0 3',
        'isCheck': true,
        'isCheckmate': false,
        'isCapture': true,
      });

      expect(move.ply, 5);
      expect(move.san, 'Bxf7+');
      expect(move.uci, 'c4f7');
      expect(move.fenAfter, startsWith('r1bqkbnr/pppp1Bpp'));
      expect(move.isCheck, isTrue);
      expect(move.isCheckmate, isFalse);
      expect(move.isCapture, isTrue);
    });

    test('drapeaux absents ou null → false', () {
      final move = ChessMove.fromJson({
        'ply': 1,
        'san': 'e4',
        'uci': 'e2e4',
        'fenAfter': 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        'isCheck': null,
      });

      expect(move.isCheck, isFalse);
      expect(move.isCheckmate, isFalse);
      expect(move.isCapture, isFalse);
    });

    test('champ obligatoire manquant → erreur de type', () {
      expect(
        () => ChessMove.fromJson({'ply': 1, 'san': 'e4', 'uci': 'e2e4'}),
        throwsA(isA<TypeError>()),
      );
    });
  });

  group('accesseurs from / to', () {
    test('coup simple', () {
      const move = ChessMove(ply: 1, san: 'e4', uci: 'e2e4', fenAfter: '');

      expect(move.from, 'e2');
      expect(move.to, 'e4');
    });

    test('promotion : le suffixe de pièce est ignoré', () {
      const move = ChessMove(ply: 79, san: 'e8=Q#', uci: 'e7e8q', fenAfter: '');

      expect(move.from, 'e7');
      expect(move.to, 'e8');
    });

    test('toString lisible pour le débogage', () {
      const move = ChessMove(ply: 3, san: 'Nf3', uci: 'g1f3', fenAfter: '');

      expect(move.toString(), 'ChessMove(3. Nf3 [g1f3])');
    });
  });
}
