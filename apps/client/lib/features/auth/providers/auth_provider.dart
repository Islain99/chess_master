import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/http/api_client.dart';
import '../models/auth_state.dart';
import '../services/oauth_service.dart';
import '../../notifications/services/push_service.dart';

// ─── État ─────────────────────────────────────────────────────────────────────

class AuthState {
  const AuthState({this.user, this.tokens});

  final AuthUser?   user;
  final AuthTokens? tokens;

  bool get isLoggedIn => user != null && tokens != null && !(tokens!.isExpired);

  AuthState copyWith({AuthUser? user, AuthTokens? tokens}) => AuthState(
        user:   user   ?? this.user,
        tokens: tokens ?? this.tokens,
      );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final authProvider =
    StateNotifierProvider<AuthNotifier, AsyncValue<AuthState>>((ref) {
  return AuthNotifier(
    ref.read(rawApiClientProvider),
    ref.read(oauthServiceProvider),
    ref.read(pushServiceProvider),
  );
});

/// Sprint 15 : SDK Google / Apple / Facebook (surchargeable dans les tests).
final oauthServiceProvider = Provider<OAuthService>((ref) => OAuthService());

/// Sprint 16 : notifications push FCM (surchargeable dans les tests).
final pushServiceProvider = Provider<PushService>((ref) => PushService());

/// Provider d'un ApiClient sans token (pour les appels auth).
final rawApiClientProvider = Provider<ApiClient>((ref) => ApiClient());

/// Provider d'un ApiClient qui envoie le jeton courant de la session.
///
/// Le provider surveille toujours l'état d'auth : les écrans qui en dépendent
/// (Mes parties, Profil…) se rechargent à la connexion / déconnexion. Mais le
/// jeton est lu à chaque requête ([ApiClient.session]) : un notifier qui a
/// gardé une ancienne instance envoie quand même le jeton à jour.
final apiClientProvider = Provider<ApiClient>((ref) {
  ref.watch(authProvider.select((s) => s.valueOrNull?.user?.id));
  return ApiClient.session();
});

// ─── Notifier ─────────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AsyncValue<AuthState>> {
  AuthNotifier(this._api, [this._oauth, this._push]) : super(const AsyncValue.loading()) {
    _restoreSession();
  }

  final ApiClient _api;
  final OAuthService? _oauth;
  final PushService? _push;

  /// Renouvelle le jeton d'accès (15 min) une minute avant son expiration.
  /// Avant, il n'était renouvelé qu'à l'ouverture de l'application : au bout
  /// de 15 minutes, l'utilisateur apparaissait déconnecté (« Mes parties »
  /// disparaissait de l'accueil) et ses parties devenaient anonymes.
  Timer? _refreshTimer;

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  void _scheduleRefresh(AuthTokens tokens) {
    _refreshTimer?.cancel();
    // expiresAt est déjà avancé d'une minute ; on renouvelle encore une
    // minute plus tôt pour que isLoggedIn ne bascule jamais à false.
    final delay = tokens.expiresAt.difference(DateTime.now()) - const Duration(minutes: 1);
    _refreshTimer = Timer(
      delay.isNegative ? Duration.zero : delay,
      () => _silentRefresh(tokens.refreshToken),
    );
  }

  void _setSession(AuthState session) {
    if (!mounted) return;
    SessionToken.current = session.tokens?.accessToken;
    state = AsyncValue.data(session);
  }

  // ─── Restauration de session ───────────────────────────────────────────────

  Future<void> _restoreSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final accessToken  = prefs.getString('access_token');
      final refreshToken = prefs.getString('refresh_token');
      final expiresAtMs  = prefs.getInt('expires_at');

      if (accessToken == null || refreshToken == null || expiresAtMs == null) {
        state = const AsyncValue.data(AuthState());
        return;
      }

      final tokens = AuthTokens(
        accessToken:  accessToken,
        refreshToken: refreshToken,
        expiresAt:    DateTime.fromMillisecondsSinceEpoch(expiresAtMs),
      );

      if (tokens.isExpired) {
        // Essayer de renouveler automatiquement
        await _silentRefresh(refreshToken);
        return;
      }

      // Récupérer le profil avec l'access token existant
      final authedApi = ApiClient(accessToken: accessToken);
      final userData = await authedApi.get('/auth/me');
      final user = AuthUser.fromJson(userData);
      _setSession(AuthState(user: user, tokens: tokens));
      _scheduleRefresh(tokens);
      _registerPush(tokens);
    } catch (_) {
      await _clearStorage();
      _setSession(const AuthState());
    }
  }

  // ─── Inscription ──────────────────────────────────────────────────────────

  Future<void> register({
    required String email,
    required String password,
    required String displayName,
  }) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.post('/auth/register', {
        'email': email,
        'password': password,
        'displayName': displayName,
      });
      await _handleAuthResponse(data);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  // ─── Connexion ────────────────────────────────────────────────────────────

  Future<void> login({
    required String email,
    required String password,
  }) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.post('/auth/login', {
        'email': email,
        'password': password,
      });
      await _handleAuthResponse(data);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  // ─── Connexion OAuth (sprint 15) ──────────────────────────────────────────

  /// Échange le jeton Google / Apple / Facebook contre nos JWT.
  /// L'API revérifie le jeton auprès du fournisseur avant d'ouvrir la session.
  Future<void> loginWithOAuth(OAuthCredential credential) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.post(
        '/auth/oauth/${credential.provider.name}',
        credential.toJson(),
      );
      await _handleAuthResponse(data);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  // ─── Profil (sprint 18) ───────────────────────────────────────────────────

  /// Met à jour le profil (PATCH /auth/me, validé côté serveur).
  /// `clearAvatar` / `clearCountry` envoient null pour effacer la valeur.
  /// Lève [ApiException] en cas de refus (ex. nom trop court).
  Future<void> updateProfile({
    String? displayName,
    String? avatarUrl,
    String? country,
    bool clearAvatar = false,
    bool clearCountry = false,
  }) async {
    final current = state.valueOrNull;
    final tokens = current?.tokens;
    if (current == null || tokens == null) {
      throw const ApiException(statusCode: 401, error: 'AUTH_REQUIRED', message: 'Connexion requise.');
    }
    final data = await ApiClient(accessToken: tokens.accessToken).patch('/auth/me', {
      if (displayName != null) 'displayName': displayName,
      if (clearAvatar) 'avatarUrl': null else if (avatarUrl != null) 'avatarUrl': avatarUrl,
      if (clearCountry) 'country': null else if (country != null) 'country': country,
    });
    state = AsyncValue.data(current.copyWith(user: AuthUser.fromJson(data)));
  }

  // ─── Déconnexion ──────────────────────────────────────────────────────────

  Future<void> logout() async {
    final current = state.valueOrNull;
    if (current?.tokens == null) return;

    try {
      final authedApi = ApiClient(accessToken: current!.tokens!.accessToken);
      // Sprint 16 : désabonner l'appareil tant que le jeton d'accès est valide.
      await _push?.unregister(authedApi);
      await authedApi.post('/auth/logout', {
        'refreshToken': current.tokens!.refreshToken,
      });
    } catch (_) {
      // Ignorer les erreurs réseau à la déconnexion
    }

    // Sprint 15 : fermer aussi la session du fournisseur (sinon « Continuer
    // avec Google » reconnecterait silencieusement le même compte).
    await _oauth?.signOutAll();

    _refreshTimer?.cancel();
    await _clearStorage();
    _setSession(const AuthState());
  }

  // ─── Renouvellement silencieux ────────────────────────────────────────────

  Future<void> _silentRefresh(String refreshToken) async {
    if (!mounted) return;
    try {
      final data = await _api.post('/auth/refresh', {'refreshToken': refreshToken});
      if (!mounted) return;
      await _handleAuthResponse(data);
    } on ApiException catch (e) {
      if (e.statusCode == 400 || e.statusCode == 401 || e.statusCode == 403) {
        // Jeton de renouvellement refusé (expiré, révoqué) : vraie déconnexion.
        _refreshTimer?.cancel();
        await _clearStorage();
        _setSession(const AuthState());
      } else {
        _retryRefreshLater(refreshToken); // serveur indisponible (5xx…)
      }
    } catch (_) {
      // Réseau coupé : on garde la session enregistrée et on réessaie,
      // au lieu de déconnecter l'utilisateur pour une coupure passagère.
      _retryRefreshLater(refreshToken);
    }
  }

  void _retryRefreshLater(String refreshToken) {
    if (!mounted) return;
    if (state.isLoading) _setSession(const AuthState());
    _refreshTimer?.cancel();
    _refreshTimer = Timer(const Duration(seconds: 30), () => _silentRefresh(refreshToken));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  Future<void> _handleAuthResponse(Map<String, dynamic> data) async {
    final accessToken   = data['accessToken']  as String;
    final refreshToken  = data['refreshToken'] as String;
    final expiresInSec  = (data['expiresIn']  as int?) ?? 900;
    final userData = data['user'] as Map<String, dynamic>;

    final tokens = AuthTokens(
      accessToken:  accessToken,
      refreshToken: refreshToken,
      expiresAt:    DateTime.now().add(Duration(seconds: expiresInSec - 60)),
    );
    final user = AuthUser.fromJson(userData);

    await _saveTokens(tokens);
    _setSession(AuthState(user: user, tokens: tokens));
    _scheduleRefresh(tokens);
    _registerPush(tokens);
  }

  /// Sprint 16 : abonne l'appareil aux notifications push, en arrière-plan
  /// (la demande de permission ne doit pas retarder l'ouverture de session).
  void _registerPush(AuthTokens tokens) {
    final push = _push;
    if (push == null || !push.isAvailable) return;
    unawaited(push.register(ApiClient(accessToken: tokens.accessToken)));
  }

  Future<void> _saveTokens(AuthTokens tokens) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token',  tokens.accessToken);
    await prefs.setString('refresh_token', tokens.refreshToken);
    await prefs.setInt('expires_at', tokens.expiresAt.millisecondsSinceEpoch);
  }

  Future<void> _clearStorage() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
    await prefs.remove('expires_at');
  }
}
