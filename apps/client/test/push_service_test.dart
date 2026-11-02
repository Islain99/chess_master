// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Tests du client push (sans Firebase réel) et de ApiClient
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:convert';

import 'package:chess_client/core/config/firebase_config.dart';
import 'package:chess_client/core/http/api_client.dart';
import 'package:chess_client/features/notifications/services/push_service.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _options = FirebaseOptions(
  apiKey: 'AIzaTest',
  appId: '1:1:android:1',
  messagingSenderId: '1',
  projectId: 'demo',
);

PushService _push(TargetPlatform platform, {bool web = false, bool configured = true}) =>
    PushService(platform: platform, isWeb: web, options: _options, configured: configured);

void main() {
  group('PushService — disponibilité', () {
    test('plateformes FCM : nom attendu par l\'API', () {
      expect(_push(TargetPlatform.android).platformName, 'ANDROID');
      expect(_push(TargetPlatform.iOS).platformName, 'IOS');
      expect(_push(TargetPlatform.macOS).platformName, 'MACOS');
      expect(_push(TargetPlatform.windows, web: true).platformName, 'WEB');
    });

    test('Windows / Linux natifs : non pris en charge', () {
      expect(_push(TargetPlatform.windows).isAvailable, isFalse);
      expect(_push(TargetPlatform.linux).platformName, isNull);
    });

    test('sans configuration Firebase : inactif partout', () {
      expect(_push(TargetPlatform.android, configured: false).isAvailable, isFalse);
      // dart-define vides pendant `flutter test`
      expect(FirebaseConfig.isConfigured, isFalse);
      expect(PushService(platform: TargetPlatform.android, isWeb: false).isAvailable, isFalse);
    });

    test('configuré + plateforme compatible : disponible', () {
      expect(_push(TargetPlatform.android).isAvailable, isTrue);
    });

    test('register() inactif → false sans appel réseau ni Firebase', () async {
      var calls = 0;
      final api = ApiClient(client: MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      }));
      expect(await _push(TargetPlatform.linux).register(api), isFalse);
      await _push(TargetPlatform.linux).unregister(api); // aucun FID : no-op
      expect(calls, 0);
    });
  });

  group('PushEvent.fromData', () {
    test('lit le bloc data envoyé par l\'API', () {
      final e = PushEvent.fromData(
        {'type': 'YOUR_TURN', 'gameId': 'g-1', 'notificationId': 'n-1'},
        title: 'À vous de jouer ♟',
        body: 'Votre adversaire a joué e4.',
      );
      expect(e.type, 'YOUR_TURN');
      expect(e.gameId, 'g-1');
      expect(e.notificationId, 'n-1');
      expect(e.title, 'À vous de jouer ♟');
    });

    test('valeurs absentes ou vides → null, type par défaut SYSTEM', () {
      final e = PushEvent.fromData({'gameId': ''});
      expect(e.type, 'SYSTEM');
      expect(e.gameId, isNull);
      expect(e.title, isNull);
    });
  });

  test('chemin du service worker Web : /push/ + configuration encodée', () {
    final uri = Uri.parse(FirebaseConfig.webServiceWorkerPath);
    expect(uri.path, 'push/firebase-messaging-sw.js');
    expect(uri.queryParameters.keys,
        containsAll(['apiKey', 'appId', 'messagingSenderId', 'projectId']));
  });

  group('ApiClient (sprint 16)', () {
    test('PATCH envoie la bonne méthode et le jeton', () async {
      late http.Request seen;
      final api = ApiClient(
        accessToken: 'jwt',
        client: MockClient((req) async {
          seen = req;
          return http.Response('{"count":1}', 200);
        }),
      );
      final res = await api.patch('/notifications/n-1/read');
      expect(seen.method, 'PATCH');
      expect(seen.url.path, endsWith('/notifications/n-1/read'));
      expect(seen.headers['Authorization'], 'Bearer jwt');
      expect(res, {'count': 1});
    });

    test('DELETE avec corps JSON et réponse 204 vide', () async {
      late http.BaseRequest seen;
      late String body;
      final api = ApiClient(
        client: MockClient((req) async {
          seen = req;
          body = req.body;
          return http.Response('', 204);
        }),
      );
      final res = await api.delete('/notifications/devices', {'token': 'fid-123'});
      expect(seen.method, 'DELETE');
      expect(jsonDecode(body), {'token': 'fid-123'});
      expect(res, isEmpty);
    });

    test('erreur API : ApiException avec statut et message serveur', () async {
      final api = ApiClient(
        client: MockClient((_) async => http.Response(
              '{"statusCode":400,"error":"Bad Request","message":"platform invalide"}',
              400,
            )),
      );
      expect(
        () => api.post('/notifications/devices', {}),
        throwsA(isA<ApiException>()
            .having((e) => e.statusCode, 'statusCode', 400)
            .having((e) => e.message, 'message', 'platform invalide')),
      );
    });
  });
}
