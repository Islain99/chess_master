// ─────────────────────────────────────────────────────────────────────────────
// Novembre 2026 — Suppression de compte (client)
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/features/auth/models/auth_state.dart';
import 'package:chess_client/features/history/models/game_summary.dart';
import 'package:chess_client/features/profile/screens/profile_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  Future<void> pumpDialog(WidgetTester tester, {required bool hasPassword}) async {
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(home: Scaffold(body: DeleteAccountDialog(hasPassword: hasPassword))),
    ));
  }

  FilledButton submit(WidgetTester tester) => tester.widget<FilledButton>(find.byType(FilledButton));

  testWidgets('compte courriel : bouton actif seulement avec mot de passe et SUPPRIMER', (tester) async {
    await pumpDialog(tester, hasPassword: true);
    expect(find.text('Mot de passe'), findsOneWidget);
    expect(submit(tester).onPressed, isNull);

    await tester.enterText(find.byKey(const ValueKey('delete-confirm')), 'supprimer');
    await tester.pump();
    expect(submit(tester).onPressed, isNull, reason: 'mot de passe manquant');

    await tester.enterText(find.widgetWithText(TextField, 'Mot de passe'), 'secret123');
    await tester.pump();
    expect(submit(tester).onPressed, isNotNull);
  });

  testWidgets('compte Google : pas de mot de passe demandé', (tester) async {
    await pumpDialog(tester, hasPassword: false);
    expect(find.text('Mot de passe'), findsNothing);
    await tester.enterText(find.byKey(const ValueKey('delete-confirm')), 'SUPPRIMER');
    await tester.pump();
    expect(submit(tester).onPressed, isNotNull);
  });

  test('AuthUser.hasPassword selon le fournisseur', () {
    AuthUser user(String? provider) => AuthUser.fromJson({
          'id': 'u', 'email': 'a@b.c', 'displayName': 'A',
          if (provider != null) 'authProvider': provider,
        });
    expect(user('LOCAL').hasPassword, isTrue);
    expect(user(null).hasPassword, isTrue);
    expect(user('GOOGLE').hasPassword, isFalse);
  });

  test('historique : adversaire en ligne supprimé → « Compte supprimé »', () {
    GameSummary summary(String mode) => GameSummary.fromJson({
          'id': 'g', 'mode': mode, 'timeControl': 'BLITZ', 'status': 'FINISHED',
          'color': 'white', 'outcome': 'win', 'result': 'WHITE_WIN', 'opponent': null,
          'moveCount': 40, 'createdAt': '2026-11-10T12:00:00Z',
        });
    expect(summary('MATCHMAKING').opponentLabel, 'Compte supprimé');
    expect(summary('PRIVATE').opponentLabel, 'Compte supprimé');
    expect(summary('LOCAL').opponentLabel, 'Partie locale');
  });
}
