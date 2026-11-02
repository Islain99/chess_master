import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/services/socket_service.dart';
import '../../auth/providers/auth_provider.dart';

// ─── État ─────────────────────────────────────────────────────────────────────

enum MatchmakingStatus { idle, searching, found, error }

class MatchmakingState {
  const MatchmakingState({
    this.status = MatchmakingStatus.idle,
    this.timeControl = 'RAPID',
    this.elo,
    this.queuedAt,
    this.gameId,
    this.playerColor,
    this.opponentElo,
    this.error,
  });

  final MatchmakingStatus status;
  final String  timeControl;
  final int?    elo;
  final DateTime? queuedAt;

  // Résultat du match
  final String? gameId;
  final String? playerColor; // 'white' | 'black'
  final int?    opponentElo;
  final String? error;

  bool get isSearching => status == MatchmakingStatus.searching;
  bool get isFound     => status == MatchmakingStatus.found;

  Duration get waitTime =>
      queuedAt != null ? DateTime.now().difference(queuedAt!) : Duration.zero;

  MatchmakingState copyWith({
    MatchmakingStatus? status,
    String? timeControl,
    int? elo,
    DateTime? queuedAt,
    String? gameId,
    String? playerColor,
    int? opponentElo,
    String? error,
  }) {
    return MatchmakingState(
      status:       status       ?? this.status,
      timeControl:  timeControl  ?? this.timeControl,
      elo:          elo          ?? this.elo,
      queuedAt:     queuedAt     ?? this.queuedAt,
      gameId:       gameId       ?? this.gameId,
      playerColor:  playerColor  ?? this.playerColor,
      opponentElo:  opponentElo  ?? this.opponentElo,
      error:        error        ?? this.error,
    );
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

final matchmakingProvider =
    StateNotifierProvider<MatchmakingNotifier, MatchmakingState>(
  (ref) {
    final token = ref.read(authProvider).valueOrNull?.tokens?.accessToken;
    return MatchmakingNotifier(token);
  },
);

// ─── Notifier ─────────────────────────────────────────────────────────────────

class MatchmakingNotifier extends StateNotifier<MatchmakingState> {
  MatchmakingNotifier(this._token) : super(const MatchmakingState());

  final String? _token;
  final _ws = SocketService.instance;
  Timer? _waitTimer;

  // ─── Rejoindre la file ─────────────────────────────────────────────────────

  Future<void> joinQueue({required String timeControl}) async {
    if (state.isSearching) return;

    state = state.copyWith(
      status:      MatchmakingStatus.searching,
      timeControl: timeControl,
      queuedAt:    DateTime.now(),
      error:       null,
    );

    _connectAndSubscribe();
    _ws.emitLobby('lobby:joinQueue', {'timeControl': timeControl});

    // Timer UI pour afficher le temps d'attente
    _waitTimer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => state = state.copyWith(), // force rebuild
    );
  }

  // ─── Quitter la file ───────────────────────────────────────────────────────

  void leaveQueue() {
    if (!state.isSearching) return;
    _ws.emitLobby('lobby:leaveQueue');
    _cleanup();
    state = const MatchmakingState();
  }

  // ─── Reset après navigation ────────────────────────────────────────────────

  void reset() {
    _cleanup();
    state = const MatchmakingState();
  }

  @override
  void dispose() {
    _cleanup();
    super.dispose();
  }

  // ─── Privé ─────────────────────────────────────────────────────────────────

  void _connectAndSubscribe() {
    _ws.connectLobby(token: _token);

    _ws.onLobby('lobby:queued', (data) {
      state = state.copyWith(elo: data['elo'] as int?);
    });

    _ws.onLobby('lobby:matchFound', (data) {
      _waitTimer?.cancel();
      state = state.copyWith(
        status:      MatchmakingStatus.found,
        gameId:      data['gameId'] as String?,
        playerColor: data['color']  as String?,
        opponentElo: (data['opponent'] as Map?)!['elo'] as int?,
      );
    });

    _ws.onLobby('lobby:leftQueue', (_) {
      // Confirmé côté serveur
    });

    _ws.onLobby('lobby:error', (data) {
      _cleanup();
      state = state.copyWith(
        status: MatchmakingStatus.error,
        error:  data['message'] as String? ?? 'Erreur matchmaking',
      );
    });
  }

  void _cleanup() {
    _waitTimer?.cancel();
    _waitTimer = null;
    _ws.disconnectLobby();
  }
}
