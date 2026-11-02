// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Tests : évaluation, lecteur, historique, avatars, pièces
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/core/settings/settings_provider.dart';
import 'package:chess_client/core/widgets/player_avatar.dart';
import 'package:chess_client/features/board/widgets/chess_piece.dart';
import 'package:chess_client/features/history/models/game_summary.dart';
import 'package:chess_client/features/multiplayer/providers/multiplayer_provider.dart';
import 'package:chess_client/features/profile/screens/profile_screen.dart';
import 'package:chess_client/features/replay/models/eval_point.dart';
import 'package:chess_client/features/replay/models/replay_game.dart';
import 'package:chess_client/features/replay/widgets/evaluation_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

Map<String, dynamic> _move(int ply, String san, String fen) =>
    {'ply': ply, 'san': san, 'uci': 'a2a3', 'fenAfter': fen};

void main() {
  // ─── Évaluation ────────────────────────────────────────────────────────────
  group('winPercent / formatEval', () {
    test('égalité = 50 %, mat = 0 ou 100 %, symétrique', () {
      expect(winPercent(0), 50);
      expect(winPercent(10000), closeTo(100, 0.01));
      expect(winPercent(-10000), closeTo(0, 0.01));
      expect(winPercent(300) + winPercent(-300), closeTo(100, 1e-9));
      expect(winPercent(300), closeTo(75.1, 0.1));
    });

    test('format lisible', () {
      expect(formatEval(130), '+1.3');
      expect(formatEval(-45), '−0.5');
      expect(formatEval(0), '0.0');
      expect(formatEval(10000), '+M');
      expect(formatEval(-9500), '−M');
    });
  });

  group('evalPointsFrom', () {
    test('utilise evalWhiteCp quand il est fourni (analyses sprint 18)', () {
      final pts = evalPointsFrom([
        {'ply': 2, 'evalCp': 40, 'evalWhiteCp': -40, 'classification': 'good'},
        {'ply': 1, 'evalCp': 30, 'evalWhiteCp': 30, 'classification': 'book'},
      ]);
      expect(pts.map((p) => p.ply), [1, 2]); // trié
      expect(pts.map((p) => p.whiteCp), [30, -40]);
    });

    test('anciennes analyses : conversion d\'après le joueur', () {
      final pts = evalPointsFrom([
        {'ply': 1, 'evalCp': 30, 'player': 'WHITE'},
        {'ply': 2, 'evalCp': 80, 'player': 'BLACK'},
      ]);
      expect(pts.map((p) => p.whiteCp), [30, -80]);
    });

    test('anciennes analyses sans joueur : parité, y compris départ aux noirs', () {
      final data = [
        {'ply': 1, 'evalCp': 50},
        {'ply': 2, 'evalCp': 50},
      ];
      expect(evalPointsFrom(data).map((p) => p.whiteCp), [50, -50]);
      expect(evalPointsFrom(data, whiteStarts: false).map((p) => p.whiteCp), [-50, 50]);
    });

    test('classification par défaut « good », entrées sans ply ignorées', () {
      final pts = evalPointsFrom([{'evalCp': 1}, {'ply': 3, 'evalWhiteCp': 0}]);
      expect(pts.single.classification, 'good');
    });
  });

  test('EvaluationChart.plyAtX : abscisse → demi-coup, borné', () {
    expect(EvaluationChart.plyAtX(0, 300, 40), 0);
    expect(EvaluationChart.plyAtX(150, 300, 40), 20);
    expect(EvaluationChart.plyAtX(300, 300, 40), 40);
    expect(EvaluationChart.plyAtX(-20, 300, 40), 0);
    expect(EvaluationChart.plyAtX(999, 300, 40), 40);
  });

  // ─── Lecteur ───────────────────────────────────────────────────────────────
  group('ReplayGame', () {
    final game = ReplayGame.fromJson({
      'id': 'g-1',
      'initialFen': _start,
      'status': 'FINISHED',
      'result': 'WHITE_WIN',
      'moves': [
        _move(1, 'e4', 'fen-1'),
        _move(2, 'e5', 'fen-2'),
        _move(3, 'Nf3', 'fen-3'),
      ],
    });

    test('positions : départ puis après chaque coup, bornées', () {
      expect(game.plyCount, 3);
      expect(game.fenAt(0), _start);
      expect(game.fenAt(2), 'fen-2');
      expect(game.fenAt(99), 'fen-3');
      expect(game.moveAt(0), isNull);
      expect(game.moveAt(3)!.san, 'Nf3');
      expect(game.isFinished, isTrue);
    });

    test('numérotation PGN depuis la position initiale', () {
      expect([1, 2, 3].map(game.moveNumberLabel), ['1.', '1…', '2.']);
    });

    test('numérotation depuis un FEN importé, trait aux noirs, coup 12', () {
      final imported = ReplayGame.fromJson({
        'id': 'g-2',
        'initialFen': '8/8/8/8/8/8/8/K6k b - - 0 12',
        'moves': [_move(1, 'Kg1', 'a'), _move(2, 'Kb1', 'b')],
      });
      expect(imported.whiteStarts, isFalse);
      expect([1, 2].map(imported.moveNumberLabel), ['12…', '13.']);
    });
  });

  // ─── Historique ────────────────────────────────────────────────────────────
  group('GameSummary.fromJson', () {
    test('adversaire humain', () {
      final g = GameSummary.fromJson({
        'id': 'g', 'mode': 'MATCHMAKING', 'timeControl': 'BLITZ', 'status': 'FINISHED',
        'color': 'black', 'outcome': 'win', 'moveCount': 51, 'createdAt': '2026-11-01T20:00:00Z',
        'opponent': {'type': 'user', 'id': 'u', 'displayName': 'Bob', 'avatarUrl': 'preset:rook-teal'},
      });
      expect(g.opponentLabel, 'Bob');
      expect(g.opponentAvatarUrl, 'preset:rook-teal');
      expect(g.isOnline, isTrue);
      expect(g.isOngoing, isFalse);
      expect('${g.modeLabel} · ${g.timeControlLabel}', 'Classée · Blitz');
    });

    test('IA, partie locale, salle en attente', () {
      GameSummary s(Map<String, dynamic> extra) =>
          GameSummary.fromJson({'id': 'g', 'createdAt': '2026-11-01T00:00:00Z', ...extra});
      expect(s({'mode': 'AI', 'opponent': {'type': 'ai', 'level': 4}}).opponentLabel, 'IA niveau 4');
      expect(s({'mode': 'LOCAL'}).opponentLabel, 'Partie locale');
      expect(s({'mode': 'PRIVATE', 'status': 'WAITING'}).isOngoing, isTrue);
    });
  });

  // ─── Avatars / profil ──────────────────────────────────────────────────────
  group('AvatarPreset', () {
    test('36 préréglages, même ordre que l\'API (pièces × couleurs)', () {
      expect(AvatarPreset.all, hasLength(36));
      expect(AvatarPreset.all.first.value, 'preset:king-red');
      expect(AvatarPreset.all.last.value, 'preset:pawn-teal');
    });

    test('parse', () {
      expect(AvatarPreset.parse('preset:knight-blue')!.id, 'knight-blue');
      expect(AvatarPreset.parse('preset:dragon-gold'), isNull);
      expect(AvatarPreset.parse('https://x/y.png'), isNull);
      expect(AvatarPreset.parse(null), isNull);
    });

    test('initiale robuste (nom vide, espaces, accent)', () {
      expect(PlayerAvatar.initialOf('élodie'), 'É');
      expect(PlayerAvatar.initialOf('   '), '?');
      expect(PlayerAvatar.initialOf(''), '?');
      expect(PlayerAvatar.colorFor('Alice'), PlayerAvatar.colorFor('Alice'));
    });
  });

  test('flagOf : drapeau emoji depuis le code pays', () {
    expect(flagOf('ca'), '🇨🇦');
    expect(flagOf('FR'), '🇫🇷');
  });

  test('normalizeColor : « white » du serveur → « w » attendu par le client', () {
    expect(normalizeColor('white'), 'w');
    expect(normalizeColor('black'), 'b');
    expect(normalizeColor('w'), 'w');
    expect(normalizeColor(null), isNull);
    expect(normalizeColor('spectator'), isNull);
  });

  // ─── Widgets ───────────────────────────────────────────────────────────────
  Widget wrap(Widget child) => ProviderScope(child: MaterialApp(home: Scaffold(body: Center(child: child))));

  testWidgets('ChessPieceWidget style « lettres » : notation française', (tester) async {
    await tester.pumpWidget(wrap(const Row(mainAxisSize: MainAxisSize.min, children: [
      ChessPieceWidget(pieceCode: 'wQ', style: PieceStyle.letters),
      ChessPieceWidget(pieceCode: 'bN', style: PieceStyle.letters),
      ChessPieceWidget(pieceCode: 'wB', style: PieceStyle.letters),
    ])));
    expect(find.text('D'), findsOneWidget); // Dame
    expect(find.text('C'), findsOneWidget); // Cavalier
    expect(find.text('F'), findsOneWidget); // Fou
  });

  testWidgets('ChessPieceWidget : glyphe en présentation texte (pas d\'emoji)', (tester) async {
    await tester.pumpWidget(wrap(const ChessPieceWidget(pieceCode: 'bP', style: PieceStyle.outline)));
    expect(find.text('♟︎'), findsNothing); // contour → glyphe « creux »
    expect(find.text('♙︎'), findsOneWidget);
  });

  testWidgets('ChessPieceWidget : code invalide → rien', (tester) async {
    await tester.pumpWidget(wrap(const ChessPieceWidget(pieceCode: 'xZ', style: PieceStyle.classic)));
    expect(find.byType(Text), findsNothing);
  });

  testWidgets('EvaluationChart : toucher sélectionne le demi-coup', (tester) async {
    int? selected;
    final points = [
      for (var i = 1; i <= 10; i++)
        EvalPoint(ply: i, whiteCp: i * 50, classification: i == 7 ? 'blunder' : 'good'),
    ];
    await tester.pumpWidget(wrap(SizedBox(
      width: 200,
      child: EvaluationChart(points: points, selectedPly: 0, onSelectPly: (p) => selected = p),
    )));

    final box = tester.getRect(find.byType(EvaluationChart));
    await tester.tapAt(Offset(box.left + box.width / 2, box.center.dy));
    expect(selected, 5);
  });

  testWidgets('PlayerAvatar : préréglage → pièce, sinon initiale', (tester) async {
    await tester.pumpWidget(wrap(const Row(mainAxisSize: MainAxisSize.min, children: [
      PlayerAvatar(displayName: 'Alice', avatarUrl: 'preset:knight-blue'),
      PlayerAvatar(displayName: 'bob'),
    ])));
    expect(find.text('♞︎'), findsOneWidget);
    expect(find.text('B'), findsOneWidget);
  });
}
