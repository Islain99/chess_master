// ─────────────────────────────────────────────────────────────────────────────
// Sprint 13 — Tests unitaires de GameState (état immuable d'une partie)
//
// GameNotifier reconstruit l'état via copyWith à chaque interaction :
// les drapeaux clearSelected / clearError / clearPendingPromotion doivent
// remettre à zéro les bons champs, et seulement ceux-là.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/features/board/models/board_position.dart';
import 'package:chess_client/features/game/models/game_state.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('GameState.initial', () {
    test('position de départ, partie en attente, aucune sélection', () {
      final s = GameState.initial();

      expect(s.position.pieces.length, 32);
      expect(s.activeColor, 'w');
      expect(s.status, GameStatus.waiting);
      expect(s.isOver, isFalse);
      expect(s.moves, isEmpty);
      expect(s.selectedSquare, isNull);
      expect(s.legalTargets, isEmpty);
      expect(s.isAiMode, isFalse);
      expect(s.isFlipped, isFalse);
    });
  });

  group('GameState.copyWith', () {
    test('sans argument : tous les champs sont conservés', () {
      final s = GameState.initial().copyWith(
        gameId: 'g1',
        whiteTimeMs: 300000,
        blackTimeMs: 290000,
        isAiMode: true,
        aiLevel: 3,
      );
      final copy = s.copyWith();

      expect(copy.gameId, 'g1');
      expect(copy.whiteTimeMs, 300000);
      expect(copy.blackTimeMs, 290000);
      expect(copy.isAiMode, isTrue);
      expect(copy.aiLevel, 3);
    });

    test('clearSelected vide la case sélectionnée ET ses cibles', () {
      final s = GameState.initial().copyWith(
        selectedSquare: 'e2',
        legalTargets: {'e3', 'e4'},
      );
      final cleared = s.copyWith(clearSelected: true);

      expect(cleared.selectedSquare, isNull);
      expect(cleared.legalTargets, isEmpty);
    });

    test('clearError ne touche qu\'à l\'erreur', () {
      final s = GameState.initial().copyWith(
        error: 'Coup illégal',
        selectedSquare: 'e2',
      );
      final cleared = s.copyWith(clearError: true);

      expect(cleared.error, isNull);
      expect(cleared.selectedSquare, 'e2');
    });

    test('clearPendingPromotion annule la promotion en attente', () {
      final s = GameState.initial().copyWith(
        pendingPromotion: {'from': 'e7', 'to': 'e8'},
      );

      expect(s.pendingPromotion, isNotNull);
      expect(s.copyWith(clearPendingPromotion: true).pendingPromotion, isNull);
    });

    test('isOver vrai uniquement quand la partie est terminée', () {
      final s = GameState.initial();

      expect(s.copyWith(status: GameStatus.ongoing).isOver, isFalse);
      expect(
        s.copyWith(status: GameStatus.finished, result: '1-0').isOver,
        isTrue,
      );
    });

    test('activeColor suit la position courante', () {
      final s = GameState.initial().copyWith(
        position: BoardPosition.fromFen(
          'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
        ),
      );

      expect(s.activeColor, 'b');
    });
  });
}
