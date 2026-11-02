// ─────────────────────────────────────────────────────────────────────────────
// Sprint 13 — Tests de widget : ClockWidget (pendule de jeu)
//
// Ce fichier porte volontairement le nom par défaut « widget_test.dart » :
// `flutter create` ne le régénère pas s'il existe déjà, ce qui évite
// l'apparition du test gabarit « compteur » lors du bootstrap des plateformes.
//
// On évite de monter ChessApp entier : AppTheme utilise google_fonts, qui
// télécharge des polices au runtime (impossible dans `flutter test`).
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/core/theme/app_theme.dart';
import 'package:chess_client/features/game/widgets/clock_widget.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// Monte la pendule dans un MaterialApp minimal (thème par défaut).
Future<void> pumpClock(WidgetTester tester, {required int ms, required bool active}) {
  return tester.pumpWidget(
    MaterialApp(home: Scaffold(body: ClockWidget(timeMs: ms, isActive: active))),
  );
}

/// Couleur de fond actuelle de la pendule.
Color? clockColor(WidgetTester tester) {
  final container = tester.widget<Container>(
    find.descendant(of: find.byType(ClockWidget), matching: find.byType(Container)),
  );
  return (container.decoration as BoxDecoration?)?.color;
}

/// Opacité actuelle de la pendule (clignotement sous 10 s).
double clockOpacity(WidgetTester tester) => tester
    .widget<Opacity>(
      find.descendant(of: find.byType(ClockWidget), matching: find.byType(Opacity)),
    )
    .opacity;

void main() {
  group('ClockWidget — format mm:ss', () {
    testWidgets('65 000 ms → 01:05', (tester) async {
      await pumpClock(tester, ms: 65000, active: false);
      expect(find.text('01:05'), findsOneWidget);
    });

    testWidgets('10 minutes → 10:00', (tester) async {
      await pumpClock(tester, ms: 600000, active: false);
      expect(find.text('10:00'), findsOneWidget);
    });

    testWidgets('arrondi supérieur : 1 500 ms → 00:02', (tester) async {
      await pumpClock(tester, ms: 1500, active: false);
      expect(find.text('00:02'), findsOneWidget);
    });

    testWidgets('temps écoulé → 00:00', (tester) async {
      await pumpClock(tester, ms: 0, active: false);
      expect(find.text('00:00'), findsOneWidget);
    });
  });

  group('ClockWidget — couleurs', () {
    testWidgets('inactive → couleur de surface', (tester) async {
      await pumpClock(tester, ms: 5000, active: false);
      expect(clockColor(tester), AppTheme.surface);
    });

    testWidgets('active, temps confortable → accent', (tester) async {
      await pumpClock(tester, ms: 120000, active: true);
      expect(clockColor(tester), AppTheme.accent);
    });

    testWidgets('active, moins de 30 s → orange', (tester) async {
      await pumpClock(tester, ms: 20000, active: true);
      expect(clockColor(tester), Colors.orange.shade700);
    });

    testWidgets('active, moins de 10 s → rouge', (tester) async {
      await pumpClock(tester, ms: 9000, active: true);
      expect(clockColor(tester), Colors.red.shade700);
    });
  });

  group('ClockWidget — clignotement', () {
    testWidgets('démarre sous 10 s puis s\'arrête quand la pendule est inactive',
        (tester) async {
      await pumpClock(tester, ms: 15000, active: true);
      expect(clockOpacity(tester), 1.0);

      // Passage sous 10 s : didUpdateWidget lance l'animation.
      await pumpClock(tester, ms: 9000, active: true);
      await tester.pump(const Duration(milliseconds: 250));
      expect(clockOpacity(tester), lessThan(1.0));

      // Le joueur a joué : la pendule redevient fixe.
      await pumpClock(tester, ms: 9000, active: false);
      await tester.pump(const Duration(milliseconds: 250));
      expect(clockOpacity(tester), 1.0);
    });
  });
}
