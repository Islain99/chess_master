import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/http/api_client.dart';
import '../models/auth_state.dart';

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
  return AuthNotifier(ref.read(rawApiClientProvider));
});

/// Provider d'un ApiClient sans token (pour les appels auth).
final rawApiClientProvider = Provider<ApiClient>((ref) => ApiClient());

/// Provider d'un ApiClient avec token injecté depuis l'état d'auth.
final apiClientProvider = Provider<ApiClient>((ref) {
  final authState = ref.watch(authProvider).valueOrNull;
  return ApiClient(accessToken: authState?.tokens?.accessToken);
});

// ─── Notifier ─────────────────────────────────────────────────────────────────

class AuthNotifier extends StateNotifier<AsyncValue<AuthState>> {
  AuthNotifier(this._api) : super(const AsyncValue.loading()) {
    _restoreSession();
  }

  final ApiClient _api;

  // ─── Restauration de session ───────────────────────────────────────────────

  Future<void> _restoreSession() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final accessToken  = prefs.getString('access_token');
      final refreshToken = prefs.getString('refresh_token');
      final expiresAtMs  = prefs.getInt('expires_at');

      if (accessToken == null || refreshToken == null || expiresAtMs == null) {
        state = AsyncValue.data(const AuthState());
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
      state = AsyncValue.data(AuthState(user: user, tokens: tokens));
    } catch (_) {
      await _clearStorage();
      state = AsyncValue.data(const AuthState());
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

  // ─── Déconnexion ──────────────────────────────────────────────────────────

  Future<void> logout() async {
    final current = state.valueOrNull;
    if (current?.tokens == null) return;

    try {
      final authedApi = ApiClient(accessToken: current!.tokens!.accessToken);
      await authedApi.post('/auth/logout', {
        'refreshToken': current.tokens!.refreshToken,
      });
    } catch (_) {
      // Ignorer les erreurs réseau à la déconnexion
    }

    await _clearStorage();
    state = AsyncValue.data(const AuthState());
  }

  // ─── Renouvellement silencieux ────────────────────────────────────────────

  Future<void> _silentRefresh(String refreshToken) async {
    try {
      final data = await _api.post('/auth/refresh', {'refreshToken': refreshToken});
      await _handleAuthResponse(data);
    } catch (_) {
      await _clearStorage();
      state = AsyncValue.data(const AuthState());
    }
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
    state = AsyncValue.data(AuthState(user: user, tokens: tokens));
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
