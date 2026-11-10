// ─────────────────────────────────────────────────────────────────────────────
// Polissage (novembre 2026) — réglages appliqués et notifications
//
//   • « Animer les coups » : la pièce glisse au-dessus de la grille ;
//   • « Effets sonores » : choix du son selon le coup ;
//   • notification touchée : écran ouvert selon l'état de la partie.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/core/audio/sound_service.dart';
import 'package:chess_client/features/board/models/board_position.dart';
import 'package:chess_client/features/board/models/chess_move.dart';
import 'package:chess_client/features/board/widgets/chess_board.dart';
import 'package:chess_client/features/board/widgets/chess_piece.dart';
import 'package:chess_client/features/board/widgets/chess_square.dart';
import 'package:chess_client/features/notifications/services/open_game.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const _afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

const _e4 = ChessMove(ply: 1, san: 'e4', uci: 'e2e4', fenAfter: _afterE4);

Finder _squareNamed(String name) =>
    find.byWidgetPredicate((w) => w is ChessSquare && w.square == name);

Widget _board(String fen, ChessMove? lastMove) => ProviderScope(
      child: MaterialApp(
        home: Scaffold(
          body: Center(
            child: SizedBox(
              width: 400,
              height: 400,
              child: ChessBoardWidget(
                position: BoardPosition.fromFen(fen),
                lastMove: lastMove,
                onSquareTap: (_) {},
                onPieceDrop: (_, __) {},
              ),
            ),
          ),
        ),
      ),
    );

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  group('Animer les coups', () {
    testWidgets('un nouveau coup glisse de la case de départ à la case d\'arrivée', (tester) async {
      await tester.pumpWidget(_board(_start, null));
      await tester.pump(); // réglages chargés (animation activée par défaut)

      await tester.pumpWidget(_board(_afterE4, _e4));
      await tester.pump(const Duration(milliseconds: 60)); // en plein glissement

      // La case d'arrivée est vide, la pièce est dans la couche du dessus.
      expect(tester.widget<ChessSquare>(_squareNamed('e4')).pieceCode, isNull);
      final overlay = find.byWidgetPredicate((w) => w is IgnorePointer && w.child is Center);
      expect(overlay, findsOneWidget);
      expect(
        tester.widget<ChessPieceWidget>(find.descendant(of: overlay, matching: find.byType(ChessPieceWidget))).pieceCode,
        'wP',
      );
      final y = tester.getCenter(overlay).dy;
      final e2 = tester.getCenter(_squareNamed('e2')).dy;
      final e4 = tester.getCenter(_squareNamed('e4')).dy;
      expect(y, lessThan(e2)); // a quitté e2…
      expect(y, greaterThan(e4)); // …sans être arrivé en e4

      await tester.pump(ChessBoardWidget.animationDuration);
      expect(tester.widget<ChessSquare>(_squareNamed('e4')).pieceCode, 'wP');
      expect(find.byWidgetPredicate((w) => w is IgnorePointer && w.child is Center), findsNothing);
    });

    testWidgets('réglage désactivé : la pièce apparaît directement', (tester) async {
      SharedPreferences.setMockInitialValues({'animate_moves': false});
      await tester.pumpWidget(_board(_start, null));
      await tester.pump();
      await tester.pumpWidget(_board(_afterE4, _e4));
      await tester.pump();
      expect(tester.widget<ChessSquare>(_squareNamed('e4')).pieceCode, 'wP');
    });

    testWidgets('reprise de partie (coup non consécutif) : pas d\'animation', (tester) async {
      await tester.pumpWidget(_board(_start, null));
      await tester.pump();
      const late = ChessMove(ply: 30, san: 'e4', uci: 'e2e4', fenAfter: _afterE4);
      await tester.pumpWidget(_board(_afterE4, late));
      await tester.pump();
      expect(tester.widget<ChessSquare>(_squareNamed('e4')).pieceCode, 'wP');
    });
  });

  group('Effets sonores', () {
    ChessMove move({bool capture = false, bool check = false, bool mate = false}) => ChessMove(
          ply: 1, san: 'x', uci: 'e2e4', fenAfter: _afterE4,
          isCapture: capture, isCheck: check, isCheckmate: mate,
        );

    test('échec > prise > coup simple', () {
      expect(GameSound.forMove(move()), GameSound.move);
      expect(GameSound.forMove(move(capture: true)), GameSound.capture);
      expect(GameSound.forMove(move(capture: true, check: true)), GameSound.check);
      expect(GameSound.forMove(move(mate: true)), GameSound.check);
    });

    test('réglage désactivé : aucun lecteur audio créé', () async {
      // Lèverait MissingPluginException si un lecteur était créé.
      await SoundService(() => false).play(GameSound.move);
    });
  });

  group('Notification → partie', () {
    test('partie en ligne en cours → écran en ligne', () {
      expect(destinationFor({'status': 'ONGOING', 'mode': 'MATCHMAKING'}), GameDestination.online);
      expect(destinationFor({'status': 'WAITING', 'mode': 'PRIVATE'}), GameDestination.online);
    });

    test('partie locale ou IA en cours → écran de partie', () {
      expect(destinationFor({'status': 'ONGOING', 'mode': 'AI'}), GameDestination.local);
      expect(destinationFor({'status': 'ONGOING', 'mode': 'LOCAL'}), GameDestination.local);
    });

    test('partie terminée → lecteur', () {
      expect(destinationFor({'status': 'FINISHED', 'mode': 'MATCHMAKING'}), GameDestination.replay);
      expect(destinationFor({'status': 'ABORTED', 'mode': 'PRIVATE'}), GameDestination.replay);
    });
  });
}
