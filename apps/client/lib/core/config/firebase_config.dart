import 'package:firebase_core/firebase_core.dart';

/// Sprint 16 — Configuration Firebase (notifications push), injectée à la compilation.
///
/// Les valeurs se trouvent dans la console Firebase, sous *Paramètres du
/// projet > Vos applications*. Elles sont propres à chaque plateforme
/// (une « application » Firebase Android, iOS, Web…) mais **publiques** :
/// la clé secrète (compte de service) ne réside que dans l'API.
///
/// ```bash
/// flutter run \
///   --dart-define=FIREBASE_API_KEY=AIza... \
///   --dart-define=FIREBASE_APP_ID=1:1234:android:abcd \
///   --dart-define=FIREBASE_MESSAGING_SENDER_ID=1234 \
///   --dart-define=FIREBASE_PROJECT_ID=chess-master \
///   --dart-define=FIREBASE_VAPID_KEY=BExx...   # Web uniquement
/// ```
///
/// Sans ces valeurs, les notifications push sont simplement désactivées
/// (les notifications restent visibles dans l'application).
class FirebaseConfig {
  FirebaseConfig._();

  static const String apiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const String appId = String.fromEnvironment('FIREBASE_APP_ID');
  static const String messagingSenderId =
      String.fromEnvironment('FIREBASE_MESSAGING_SENDER_ID');
  static const String projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

  /// Bundle ID iOS/macOS (facultatif : déduit de l'application sinon).
  static const String iosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');

  /// Clé publique VAPID « Web Push certificates » (console Firebase > Cloud Messaging).
  static const String vapidKey = String.fromEnvironment('FIREBASE_VAPID_KEY');

  static bool get isConfigured =>
      apiKey.isNotEmpty && appId.isNotEmpty && messagingSenderId.isNotEmpty && projectId.isNotEmpty;

  /// Options passées à Firebase.initializeApp (aucun google-services.json requis).
  static FirebaseOptions? get options => isConfigured
      ? FirebaseOptions(
          apiKey: apiKey,
          appId: appId,
          messagingSenderId: messagingSenderId,
          projectId: projectId,
          iosBundleId: iosBundleId.isEmpty ? null : iosBundleId,
        )
      : null;

  /// Web : le service worker Firebase est servi depuis /push/ (portée distincte
  /// du service worker de Flutter) et reçoit la configuration par l'URL.
  static String get webServiceWorkerPath => Uri(
        path: 'push/firebase-messaging-sw.js',
        queryParameters: {
          'apiKey': apiKey,
          'appId': appId,
          'messagingSenderId': messagingSenderId,
          'projectId': projectId,
        },
      ).toString();
}
