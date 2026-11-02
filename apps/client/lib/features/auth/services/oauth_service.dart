// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Connexion Google, Apple et Facebook côté client
//
// Ce service ne fait QU'OBTENIR un jeton auprès du fournisseur via son SDK
// natif. Le jeton est ensuite envoyé à l'API (POST /auth/oauth/:provider),
// qui le revérifie et renvoie nos propres JWT : le client n'est jamais cru
// sur parole.
//
// Disponibilité par plateforme (limites des SDK officiels) :
//
//   | Fournisseur | Android | iOS | macOS | Web | Windows | Linux |
//   |-------------|:-------:|:---:|:-----:|:---:|:-------:|:-----:|
//   | Google      |    ✔    |  ✔  |   ✔   |  ✔¹ |    ✖    |   ✖   |
//   | Apple       |    ✔²   |  ✔  |   ✔   |  ✔² |    ✖    |   ✖   |
//   | Facebook    |    ✔    |  ✔  |   ✔   |  ✔  |    ✖    |   ✖   |
//
//   ¹ sur le Web, Google impose son propre bouton (renderButton) : le jeton
//     arrive par [googleWebCredentials] et non par [signIn].
//   ² via une page Apple + l'URL de rappel de l'API (APPLE_REDIRECT_URI).
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_facebook_auth/flutter_facebook_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

import '../../../core/config/oauth_config.dart';

/// Fournisseurs pris en charge ; `name` correspond au segment d'URL de l'API.
enum OAuthProvider {
  google('Google'),
  apple('Apple'),
  facebook('Facebook');

  const OAuthProvider(this.label);
  final String label;
}

/// Jeton obtenu auprès d'un fournisseur, prêt à être échangé auprès de l'API.
class OAuthCredential {
  const OAuthCredential({
    required this.provider,
    required this.token,
    this.nonce,
    this.displayName,
  });

  final OAuthProvider provider;
  final String token;

  /// Nonce BRUT (Apple, Facebook Limited Login) : l'API vérifie que le jeton
  /// contient bien son empreinte (Apple) ou sa valeur (Facebook).
  final String? nonce;

  /// Nom transmis par Apple au client lors de la toute première connexion.
  final String? displayName;

  /// Corps JSON attendu par POST /auth/oauth/:provider.
  Map<String, dynamic> toJson() => {
        'token': token,
        if (nonce != null) 'nonce': nonce,
        if (displayName != null) 'displayName': displayName,
      };
}

/// Erreur lisible par l'utilisateur (l'annulation n'en est pas une : null).
class OAuthException implements Exception {
  const OAuthException(this.message);
  final String message;

  @override
  String toString() => message;
}

class OAuthService {
  OAuthService({
    TargetPlatform? platform,
    bool? isWeb,
  })  : _platform = platform ?? defaultTargetPlatform,
        _isWeb = isWeb ?? kIsWeb;

  final TargetPlatform _platform;
  final bool _isWeb;

  Future<void>? _googleInit;
  bool _facebookWebInit = false;

  bool get _isApple =>
      !_isWeb && (_platform == TargetPlatform.iOS || _platform == TargetPlatform.macOS);
  bool get _isAndroid => !_isWeb && _platform == TargetPlatform.android;

  // ─── Disponibilité ─────────────────────────────────────────────────────────

  /// Fournisseurs utilisables sur cette plateforme ET configurés.
  List<OAuthProvider> get availableProviders => [
        if (_supportsGoogle) OAuthProvider.google,
        if (_supportsApple) OAuthProvider.apple,
        if (_supportsFacebook) OAuthProvider.facebook,
      ];

  bool get _supportsGoogle {
    if (_isWeb) return OAuthConfig.googleClientId.isNotEmpty;
    if (_isAndroid) return OAuthConfig.googleServerClientId.isNotEmpty;
    if (_isApple) return OAuthConfig.googleClientId.isNotEmpty;
    return false; // Windows / Linux : pas de SDK officiel
  }

  bool get _supportsApple {
    if (_isApple) return true; // natif, aucune configuration côté client
    if (_isWeb || _isAndroid) {
      return OAuthConfig.appleServiceId.isNotEmpty && OAuthConfig.appleRedirectUri.isNotEmpty;
    }
    return false;
  }

  bool get _supportsFacebook {
    if (_isWeb) return OAuthConfig.facebookAppId.isNotEmpty;
    return _isAndroid || _isApple; // App ID lu depuis la configuration native
  }

  /// Sur le Web, Google n'autorise que son propre bouton (voir GoogleWebButton).
  bool get usesGoogleWebButton => _isWeb && _supportsGoogle;

  // ─── Point d'entrée ────────────────────────────────────────────────────────

  /// Lance la connexion. Renvoie `null` si l'utilisateur annule.
  Future<OAuthCredential?> signIn(OAuthProvider provider) {
    switch (provider) {
      case OAuthProvider.google:
        return _signInWithGoogle();
      case OAuthProvider.apple:
        return _signInWithApple();
      case OAuthProvider.facebook:
        return _signInWithFacebook();
    }
  }

  /// Déconnexion « best effort » des SDK (ne bloque jamais la déconnexion API).
  Future<void> signOutAll() async {
    try {
      if (_googleInit != null) await GoogleSignIn.instance.signOut();
    } catch (_) {}
    try {
      if (_supportsFacebook) await FacebookAuth.instance.logOut();
    } catch (_) {}
  }

  // ─── Google ────────────────────────────────────────────────────────────────

  Future<void> _ensureGoogle() {
    return _googleInit ??= GoogleSignIn.instance.initialize(
      // clientId : Web et iOS/macOS ; inutile sur Android (lu depuis
      // google-services / l'empreinte SHA-1 de l'APK).
      clientId: _isAndroid || OAuthConfig.googleClientId.isEmpty
          ? null
          : OAuthConfig.googleClientId,
      // serverClientId : audience de l'ID token sur mobile (non supporté sur le Web).
      serverClientId: _isWeb || OAuthConfig.googleServerClientId.isEmpty
          ? null
          : OAuthConfig.googleServerClientId,
    );
  }

  Future<OAuthCredential?> _signInWithGoogle() async {
    await _ensureGoogle();
    if (!GoogleSignIn.instance.supportsAuthenticate()) {
      throw const OAuthException('Utilisez le bouton Google affiché à l\'écran.');
    }
    try {
      final account = await GoogleSignIn.instance.authenticate(scopeHint: const ['email']);
      return _googleCredential(account);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) return null;
      throw OAuthException('Connexion Google impossible (${e.code.name}).');
    }
  }

  /// Web : jetons émis par le bouton Google (renderButton). À écouter depuis
  /// l'écran de connexion tant qu'il est affiché.
  Stream<OAuthCredential> googleWebCredentials() async* {
    await _ensureGoogle();
    await for (final event in GoogleSignIn.instance.authenticationEvents) {
      if (event is GoogleSignInAuthenticationEventSignIn) {
        final credential = _googleCredential(event.user);
        if (credential != null) yield credential;
      }
    }
  }

  OAuthCredential? _googleCredential(GoogleSignInAccount account) {
    final idToken = account.authentication.idToken;
    if (idToken == null) {
      throw const OAuthException('Google n\'a pas fourni de jeton d\'identité.');
    }
    return OAuthCredential(provider: OAuthProvider.google, token: idToken);
  }

  // ─── Apple ─────────────────────────────────────────────────────────────────

  Future<OAuthCredential?> _signInWithApple() async {
    // Apple reçoit SHA-256(nonce) et l'API reçoit le nonce brut.
    final rawNonce = generateNonce();
    try {
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [AppleIDAuthorizationScopes.email, AppleIDAuthorizationScopes.fullName],
        nonce: sha256Hex(rawNonce),
        webAuthenticationOptions: _isApple
            ? null
            : WebAuthenticationOptions(
                clientId: OAuthConfig.appleServiceId,
                redirectUri: Uri.parse(OAuthConfig.appleRedirectUri),
              ),
      );

      final token = credential.identityToken;
      if (token == null) {
        throw const OAuthException('Apple n\'a pas fourni de jeton d\'identité.');
      }
      return OAuthCredential(
        provider: OAuthProvider.apple,
        token: token,
        nonce: rawNonce,
        displayName: appleDisplayName(credential.givenName, credential.familyName),
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return null;
      throw OAuthException('Connexion Apple impossible (${e.code.name}).');
    } on SignInWithAppleException catch (e) {
      throw OAuthException('Connexion Apple impossible : $e');
    }
  }

  // ─── Facebook ──────────────────────────────────────────────────────────────

  Future<OAuthCredential?> _signInWithFacebook() async {
    if (_isWeb && !_facebookWebInit) {
      await FacebookAuth.instance.webAndDesktopInitialize(
        appId: OAuthConfig.facebookAppId,
        cookie: true,
        xfbml: true,
        version: OAuthConfig.facebookGraphVersion,
      );
      _facebookWebInit = true;
    }

    // Sur iOS, sans autorisation de suivi (ATT), le SDK renvoie un jeton
    // « Limited Login » (JWT) lié à ce nonce ; ailleurs, un access token.
    final rawNonce = generateNonce();
    final result = await FacebookAuth.instance.login(
      permissions: const ['email', 'public_profile'],
      nonce: rawNonce,
    );

    switch (result.status) {
      case LoginStatus.success:
        final token = result.accessToken;
        if (token == null) {
          throw const OAuthException('Facebook n\'a pas fourni de jeton.');
        }
        return OAuthCredential(
          provider: OAuthProvider.facebook,
          token: token.tokenString,
          nonce: token is LimitedToken ? rawNonce : null,
        );
      case LoginStatus.cancelled:
        return null;
      case LoginStatus.failed:
      case LoginStatus.operationInProgress:
        throw OAuthException(
          'Connexion Facebook impossible${result.message != null ? ' : ${result.message}' : '.'}',
        );
    }
  }
}

// ─── Utilitaires (publics pour les tests) ────────────────────────────────────

const _nonceCharset = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';

/// Nonce cryptographiquement aléatoire (générateur sûr du système).
String generateNonce([int length = 32]) {
  final random = Random.secure();
  return List.generate(length, (_) => _nonceCharset[random.nextInt(_nonceCharset.length)])
      .join();
}

/// Empreinte SHA-256 hexadécimale (format attendu par l'API pour Apple).
String sha256Hex(String input) => sha256.convert(utf8.encode(input)).toString();

/// « Prénom Nom » renvoyé par Apple, ramené aux bornes de l'API (2–32 caractères).
String? appleDisplayName(String? givenName, String? familyName) {
  final full = [givenName, familyName]
      .whereType<String>()
      .map((s) => s.trim())
      .where((s) => s.isNotEmpty)
      .join(' ');
  if (full.length < 2) return null;
  return full.length > 32 ? full.substring(0, 32).trimRight() : full;
}
