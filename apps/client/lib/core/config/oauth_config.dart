/// Sprint 15 — Identifiants OAuth publics, injectés à la compilation.
///
/// Ce ne sont PAS des secrets (ils sont visibles dans toute application
/// publiée) ; les secrets (Facebook App Secret…) restent côté API.
///
/// ```bash
/// flutter run \
///   --dart-define=GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com \
///   --dart-define=GOOGLE_SERVER_CLIENT_ID=yyy.apps.googleusercontent.com \
///   --dart-define=APPLE_SERVICE_ID=com.islain99.chess.signin \
///   --dart-define=APPLE_REDIRECT_URI=https://chess.example.com/api/v1/auth/oauth/apple/callback \
///   --dart-define=FACEBOOK_APP_ID=1234567890
/// ```
///
/// Une valeur vide désactive le bouton correspondant : l'application reste
/// utilisable avec e-mail / mot de passe tant que les consoles fournisseurs
/// ne sont pas configurées (voir docs/oauth-setup.md).
class OAuthConfig {
  OAuthConfig._();

  /// Client ID OAuth Google de la plateforme courante :
  /// type « Web » sur le Web, type « iOS » sur iOS/macOS.
  static const String googleClientId = String.fromEnvironment('GOOGLE_CLIENT_ID');

  /// Client ID Google de type « Web » utilisé comme audience de l'ID token
  /// sur Android et iOS (doit figurer dans GOOGLE_CLIENT_IDS côté API).
  static const String googleServerClientId =
      String.fromEnvironment('GOOGLE_SERVER_CLIENT_ID');

  /// Services ID Apple (Android et Web uniquement ; iOS/macOS utilisent le bundle ID).
  static const String appleServiceId = String.fromEnvironment('APPLE_SERVICE_ID');

  /// URL de rappel Apple → POST /api/v1/auth/oauth/apple/callback de l'API.
  static const String appleRedirectUri = String.fromEnvironment('APPLE_REDIRECT_URI');

  /// App ID Meta (requis pour initialiser le SDK JavaScript sur le Web).
  static const String facebookAppId = String.fromEnvironment('FACEBOOK_APP_ID');

  /// Version de l'API Graph pour le SDK JavaScript Facebook.
  static const String facebookGraphVersion =
      String.fromEnvironment('FACEBOOK_GRAPH_VERSION', defaultValue: 'v21.0');
}
