import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/http/api_client.dart';
import '../../../core/services/socket_service.dart';
import '../../auth/providers/auth_provider.dart';
import '../../board/models/board_position.dart';
import '../../board/models/chess_move.dart';
import '../../game/models/game_state.dart';

// ─── Provider ─────────────────────────────────────────────────────────────────

final multiplayerProvider =
    StateNotifierProvider<MultiplayerNotifier, AsyncValue<OnlineGameState>>(
  (ref) {
    final apiClient = ref.read(apiClientProvider);
    final authState = ref.read(authProvider).valueOrNull;
    return MultiplayerNotifier(apiClient, authState?.tokens?.accessToken);
  },
);

// ─── État en ligne ────────────────────────────────────────────────────────────

class OnlineGameState {
  const OnlineGameState({
    this.gameId,
    this.roomCode,
    required this.board,
    this.playerColor,   // 'w' ou 'b'
    this.status = 'waiting',
    this.result,
    this.resultReason,
    this.opponentConnected = true,
    this.drawOffered = false,
    this.error,
    this.isConnecting = false,
  });

  final String?    gameId;
  final String?    roomCode;
  final GameState  board;        // état du plateau (partagé avec GameState)
  final String?    playerColor;
  final String     status;       // 'waiting' | 'ongoing' | 'finished'
  final String?    result;
  final String?    resultReason;
  final bool       opponentConnected;
  final bool       drawOffered;
  final String?    error;
  final bool       isConnecting;

  bool get isOver    => status == 'finished';
  bool get isWaiting => status == 'waiting';

  OnlineGameState copyWith({
    String? gameId,
    String? roomCode,
    GameState? board,
    String? playerColor,
    String? status,
    String? result,
    String? resultReason,
    bool? opponentConnected,
    bool? drawOffered,
    String? error,
    bool? isConnecting,
    bool clearError = false,
  }) {
    return OnlineGameState(
      gameId: gameId ?? this.gameId,
      roomCode: roomCode ?? this.roomCode,
      board: board ?? this.board,
      playerColor: playerColor ?? this.playerColor,
      status: status ?? this.status,
      result: result ?? this.result,
      resultReason: resultReason ?? this.resultReason,
      opponentConnected: opponentConnected ?? this.opponentConnected,
      drawOffered: drawOffered ?? this.drawOffered,
      error: clearError ? null : (error ?? this.error),
      isConnecting: isConnecting ?? this.isConnecting,
    );
  }

  static OnlineGameState empty() => OnlineGameState(
        board: GameState.initial(),
        status: 'waiting',
      );
}

// ─── Notifier ─────────────────────────────────────────────────────────────────

class MultiplayerNotifier extends StateNotifier<AsyncValue<OnlineGameState>> {
  MultiplayerNotifier(this._api, this._token)
      : super(AsyncValue.data(OnlineGameState.empty()));

  final ApiClient _api;
  final String?   _token;
  final SocketService _ws = SocketService.instance;

  // ─── Création de salle ────────────────────────────────────────────────────

  Future<String?> createRoom({String timeControl = 'RAPID'}) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.post('/rooms', {'timeControl': timeControl});
      final roomCode = data['roomCode'] as String;
      final gameId   = data['gameId']   as String;

      state = AsyncValue.data(OnlineGameState(
        gameId:      gameId,
        roomCode:    roomCode,
        board:       GameState.initial(),
        playerColor: 'w', // l'hôte joue toujours les blancs
        status:      'waiting',
        isConnecting: true,
      ));

      _connectAndJoin(gameId);
      _listenLobby(roomCode);

      return roomCode;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return null;
    }
  }

  // ─── Rejoindre une salle ──────────────────────────────────────────────────

  Future<bool> joinRoom(String roomCode) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.post('/rooms/${roomCode.toUpperCase()}/join', {});
      final gameId = data['id'] as String;

      state = AsyncValue.data(OnlineGameState(
        gameId:      gameId,
        roomCode:    roomCode.toUpperCase(),
        board:       GameState.initial(),
        playerColor: 'b', // le deuxième joueur joue les noirs
        status:      'ongoing',
        isConnecting: true,
      ));

      _connectAndJoin(gameId);
      return true;
    } catch (e, st) {
      state = AsyncValue.error(e, st);
      return false;
    }
  }

  // ─── Interaction plateau ──────────────────────────────────────────────────

  void onSquareTap(String square) {
    final s = state.valueOrNull;
    if (s == null || s.isOver || !s.opponentConnected) return;
    // Vérifier que c'est bien notre tour
    if (!_isMyTurn(s)) return;

    final board = s.board;
    final selected = board.selectedSquare;

    if (selected != null && board.legalTargets.contains(square)) {
      _tryMove(selected, square, s);
      return;
    }

    final piece = board.position.pieceAt(square);
    final isMe = piece != null && piece.startsWith(board.activeColor);
    if (isMe && board.moveMap.containsKey(square)) {
      state = AsyncValue.data(s.copyWith(
        board: board.copyWith(
          selectedSquare: square,
          legalTargets: board.moveMap[square]!,
        ),
      ));
    } else {
      state = AsyncValue.data(s.copyWith(
        board: board.copyWith(clearSelected: true),
      ));
    }
  }

  void onPieceDrop(String from, String to) {
    final s = state.valueOrNull;
    if (s == null || s.isOver || !_isMyTurn(s)) return;
    if (s.board.moveMap[from]?.contains(to) ?? false) {
      _tryMove(from, to, s);
    }
  }

  Future<void> confirmPromotion(String pieceType) async {
    final s = state.valueOrNull;
    if (s?.board.pendingPromotion == null) return;
    final from = s!.board.pendingPromotion!['from']!;
    final to   = s.board.pendingPromotion!['to']!;
    state = AsyncValue.data(s.copyWith(
      board: s.board.copyWith(clearPendingPromotion: true),
    ));
    _sendMove('$from$to${pieceType.toLowerCase()}', s);
  }

  // ─── Actions de jeu ───────────────────────────────────────────────────────

  void resign() {
    final s = state.valueOrNull;
    if (s?.gameId == null) return;
    _ws.emitGame('game:resign', {
      'gameId': s!.gameId!,
      'color': s.playerColor == 'w' ? 'white' : 'black',
    });
  }

  void offerDraw() {
    final s = state.valueOrNull;
    if (s?.gameId == null) return;
    _ws.emitGame('game:drawOffer', {'gameId': s!.gameId!});
  }

  void respondToDraw(bool accept) {
    final s = state.valueOrNull;
    if (s?.gameId == null) return;
    _ws.emitGame('game:drawResponse', {
      'gameId': s!.gameId!,
      'accept': accept,
    });
    if (!accept) {
      state = AsyncValue.data(s.copyWith(drawOffered: false));
    }
  }

  void flipBoard() {
    final s = state.valueOrNull;
    if (s == null) return;
    state = AsyncValue.data(s.copyWith(
      board: s.board.copyWith(isFlipped: !s.board.isFlipped),
    ));
  }

  // ─── Déconnexion ──────────────────────────────────────────────────────────

  void disconnect() {
    _ws.disconnectGame();
    _ws.disconnectLobby();
  }

  @override
  void dispose() {
    disconnect();
    super.dispose();
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  bool _isMyTurn(OnlineGameState s) {
    if (s.playerColor == null) return false;
    return s.board.activeColor == s.playerColor![0];
  }

  void _connectAndJoin(String gameId) {
    _ws.connectGame(token: _token);
    // Attendre la connexion puis émettre game:join
    _ws.onGame('connect', (_) {
      _ws.emitGame('game:join', {'gameId': gameId});
    });
    _subscribeGameEvents();
  }

  void _listenLobby(String roomCode) {
    _ws.connectLobby(token: _token);
    _ws.onLobby('connect', (_) {
      _ws.emitLobby('lobby:waitRoom', {'roomCode': roomCode});
    });
    _ws.onLobby('lobby:opponentJoined', (_) {
      // L'adversaire vient de rejoindre → le GameGateway diffusera game:state
      final s = state.valueOrNull;
      if (s != null) {
        state = AsyncValue.data(s.copyWith(status: 'ongoing'));
      }
    });
  }

  void _subscribeGameEvents() {
    // État complet (connexion initiale, reconnexion, adversaire rejoint)
    _ws.onGame('game:state', (data) {
      final s = state.valueOrNull ?? OnlineGameState.empty();
      state = AsyncValue.data(_applyFullState(s, data));
    });

    // Coup validé et diffusé
    _ws.onGame('game:moveMade', (data) {
      final s = state.valueOrNull;
      if (s == null) return;
      state = AsyncValue.data(_applyMoveResult(s, data));
    });

    // Fin de partie
    _ws.onGame('game:ended', (data) {
      final s = state.valueOrNull;
      if (s == null) return;
      state = AsyncValue.data(s.copyWith(
        status:       'finished',
        result:       data['result'] as String?,
        resultReason: data['reason'] as String?,
        board: s.board.copyWith(
          status: GameStatus.finished,
          result: data['result'] as String?,
          resultReason: data['reason'] as String?,
        ),
      ));
    });

    // Coup refusé
    _ws.onGame('game:invalidMove', (data) {
      final s = state.valueOrNull;
      if (s == null) return;
      state = AsyncValue.data(s.copyWith(
        board: s.board.copyWith(error: 'Coup refusé : ${data['reason']}'),
      ));
    });

    // Adversaire déconnecté
    _ws.onGame('game:opponentDisconnected', (_) {
      final s = state.valueOrNull;
      if (s == null) return;
      state = AsyncValue.data(s.copyWith(opponentConnected: false));
    });

    // Adversaire reconnecté
    _ws.onGame('game:opponentReconnected', (_) {
      final s = state.valueOrNull;
      if (s == null) return;
      state = AsyncValue.data(s.copyWith(opponentConnected: true));
    });

    // Offre de nulle reçue
    _ws.onGame('game:drawOffered', (_) {
      final s = state.valueOrNull;
      if (s == null) return;
      state = AsyncValue.data(s.copyWith(drawOffered: true));
    });

    // Nulle refusée
    _ws.onGame('game:drawDeclined', (_) {
      final s = state.valueOrNull;
      if (s == null) return;
      state = AsyncValue.data(s.copyWith(drawOffered: false));
    });
  }

  void _tryMove(String from, String to, OnlineGameState s) {
    final piece = s.board.position.pieceAt(from);
    final isPromotion = piece != null &&
        piece.endsWith('P') &&
        ((piece.startsWith('w') && to.endsWith('8')) ||
            (piece.startsWith('b') && to.endsWith('1')));

    if (isPromotion) {
      state = AsyncValue.data(s.copyWith(
        board: s.board.copyWith(
          pendingPromotion: {'from': from, 'to': to},
          clearSelected: true,
        ),
      ));
      return;
    }
    _sendMove('$from$to', s);
  }

  void _sendMove(String uci, OnlineGameState s) {
    if (s.gameId == null) return;
    state = AsyncValue.data(s.copyWith(
      board: s.board.copyWith(clearSelected: true),
    ));
    _ws.emitGame('game:move', {
      'gameId': s.gameId!,
      'uci':    uci,
    });
  }

  // ─── Parsing ──────────────────────────────────────────────────────────────

  OnlineGameState _applyFullState(OnlineGameState s, Map<String, dynamic> data) {
    final fen       = data['fen'] as String? ?? BoardPosition.initialFen;
    final position  = BoardPosition.fromFen(fen);
    final moves     = (data['moves'] as List? ?? [])
        .cast<Map<String, dynamic>>()
        .map(ChessMove.fromJson)
        .toList();
    final legalMoves = (data['legalMoves'] as List? ?? []).cast<String>();
    final moveMap    = BoardPosition.buildMoveMap(legalMoves);
    final clocks     = data['clocks'] as Map<String, dynamic>? ?? {};
    final statusStr  = data['status'] as String? ?? 'WAITING';
    final gs         = _parseGameStatus(statusStr);
    final color      = data['playerColor'] as String? ?? s.playerColor;

    return s.copyWith(
      gameId:      data['id'] as String? ?? s.gameId,
      playerColor: color,
      status:      statusStr.toLowerCase(),
      board: GameState(
        gameId:     data['id'] as String? ?? s.gameId,
        position:   position,
        moves:      moves,
        moveMap:    moveMap,
        lastMove:   moves.isNotEmpty ? moves.last : null,
        status:     gs,
        result:     data['result'] as String?,
        resultReason: data['resultReason'] as String?,
        whiteTimeMs: (clocks['white'] as int?) ?? s.board.whiteTimeMs,
        blackTimeMs: (clocks['black'] as int?) ?? s.board.blackTimeMs,
        isFlipped:  s.board.isFlipped,
      ),
      isConnecting: false,
    );
  }

  OnlineGameState _applyMoveResult(OnlineGameState s, Map<String, dynamic> data) {
    final moveData = data['move'] as Map<String, dynamic>? ?? {};
    final gameData = data['game'] as Map<String, dynamic>? ?? {};

    final move = ChessMove(
      ply:         moveData['ply'] as int? ?? s.board.moves.length + 1,
      san:         moveData['san'] as String? ?? '',
      uci:         moveData['uci'] as String? ?? '',
      fenAfter:    moveData['fenAfter'] as String? ?? s.board.position.toString(),
      isCheck:     (moveData['isCheck']    as bool?) ?? false,
      isCheckmate: (moveData['isCheckmate'] as bool?) ?? false,
      isCapture:   (moveData['isCapture']  as bool?) ?? false,
    );

    final newFen    = gameData['fen'] as String? ?? move.fenAfter;
    final legalMoves = (gameData['legalMoves'] as List? ?? []).cast<String>();
    final clocks     = gameData['clocks'] as Map<String, dynamic>? ?? {};
    final statusStr  = gameData['status'] as String? ?? 'ONGOING';

    return s.copyWith(
      status: statusStr.toLowerCase(),
      board: s.board.copyWith(
        position:    BoardPosition.fromFen(newFen),
        moves:       [...s.board.moves, move],
        moveMap:     BoardPosition.buildMoveMap(legalMoves),
        lastMove:    move,
        status:      _parseGameStatus(statusStr),
        result:      gameData['result'] as String?,
        resultReason: gameData['resultReason'] as String?,
        whiteTimeMs: (clocks['white'] as int?) ?? s.board.whiteTimeMs,
        blackTimeMs: (clocks['black'] as int?) ?? s.board.blackTimeMs,
        clearSelected: true,
      ),
    );
  }

  GameStatus _parseGameStatus(String s) {
    switch (s.toUpperCase()) {
      case 'ONGOING':  return GameStatus.ongoing;
      case 'FINISHED': return GameStatus.finished;
      default:         return GameStatus.waiting;
    }
  }
}
