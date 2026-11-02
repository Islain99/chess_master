// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Tests de OAuthService (sans appel aux SDK des fournisseurs)
//
// Les dart-define OAuth sont vides pendant `flutter test` : on vérifie donc le
// comportement « non configuré » (Google masqué, Apple natif uniquement sur
// iOS/macOS) et les utilitaires de nonce / nom d'affichage.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/features/auth/services/oauth_service.dart';
import 'package:chess_client/features/auth/widgets/oauth_buttons.dart';
import 'package:chess_client/features/auth/providers/auth_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('availableProviders (aucun identifiant configuré)', () {
    OAuthService on(TargetPlatform p, {bool web = false}) => OAuthService(platform: p, isWeb: web);

    test('iOS et macOS : Apple (natif) et Facebook', () {
      expect(on(TargetPlatform.iOS).availableProviders,
          [OAuthProvider.apple, OAuthProvider.facebook]);
      expect(on(TargetPlatform.macOS).availableProviders,
          [OAuthProvider.apple, OAuthProvider.facebook]);
    });

    test('Android : Facebook seulement (Google et Apple exigent des identifiants)', () {
      expect(on(TargetPlatform.android).availableProviders, [OAuthProvider.facebook]);
    });

    test('Web non configuré : aucun fournisseur', () {
      final web = on(TargetPlatform.windows, web: true);
      expect(web.availableProviders, isEmpty);
      expect(web.usesGoogleWebButton, isFalse);
    });

    test('Windows et Linux : aucun SDK officiel → aucun fournisseur', () {
      expect(on(TargetPlatform.windows).availableProviders, isEmpty);
      expect(on(TargetPlatform.linux).availableProviders, isEmpty);
    });
  });

  group('OAuthCredential.toJson', () {
    test('n\'envoie que les champs renseignés', () {
      const google = OAuthCredential(provider: OAuthProvider.google, token: 'id.token.sig');
      expect(google.toJson(), {'token': 'id.token.sig'});

      const apple = OAuthCredential(
        provider: OAuthProvider.apple,
        token: 't',
        nonce: 'n',
        displayName: 'Bob Martin',
      );
      expect(apple.toJson(), {'token': 't', 'nonce': 'n', 'displayName': 'Bob Martin'});
    });

    test('le nom d\'enum correspond au segment d\'URL de l\'API', () {
      expect(OAuthProvider.values.map((p) => p.name), ['google', 'apple', 'facebook']);
    });
  });

  group('generateNonce', () {
    test('32 caractères par défaut, alphabet sûr pour une URL', () {
      final nonce = generateNonce();
      expect(nonce.length, 32);
      expect(RegExp(r'^[0-9A-Za-z\-._]+$').hasMatch(nonce), isTrue);
    });

    test('longueur personnalisée et valeurs distinctes', () {
      expect(generateNonce(64).length, 64);
      final values = {for (var i = 0; i < 50; i++) generateNonce()};
      expect(values.length, 50);
    });
  });

  test('sha256Hex : vecteur de test FIPS 180-2 (« abc »)', () {
    expect(
      sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  group('appleDisplayName', () {
    test('prénom + nom', () => expect(appleDisplayName('Bob', 'Martin'), 'Bob Martin'));
    test('prénom seul, espaces retirés', () => expect(appleDisplayName('  Bob ', null), 'Bob'));
    test('rien ou trop court → null', () {
      expect(appleDisplayName(null, null), isNull);
      expect(appleDisplayName('', ' '), isNull);
      expect(appleDisplayName('B', null), isNull);
    });
    test('tronqué à 32 caractères (limite de l\'API)', () {
      final name = appleDisplayName('A' * 20, 'B' * 20)!;
      expect(name.length, lessThanOrEqualTo(32));
      expect(name, startsWith('A' * 20));
    });
  });

  group('OAuthButtons', () {
    Future<void> pump(WidgetTester tester, OAuthService service) {
      return tester.pumpWidget(
        ProviderScope(
          overrides: [oauthServiceProvider.overrideWithValue(service)],
          child: MaterialApp(
            home: Scaffold(body: OAuthButtons(onSuccess: () {}, onError: (_) {})),
          ),
        ),
      );
    }

    testWidgets('iOS : boutons Apple et Facebook, séparateur « ou »', (tester) async {
      await pump(tester, OAuthService(platform: TargetPlatform.iOS, isWeb: false));

      expect(find.text('ou'), findsOneWidget);
      expect(find.text('Continuer avec Apple'), findsOneWidget);
      expect(find.text('Continuer avec Facebook'), findsOneWidget);
      expect(find.text('Continuer avec Google'), findsNothing);
    });

    testWidgets('Linux : rien n\'est affiché', (tester) async {
      await pump(tester, OAuthService(platform: TargetPlatform.linux, isWeb: false));

      expect(find.text('ou'), findsNothing);
      expect(find.byType(ElevatedButton), findsNothing);
    });
  });
}
