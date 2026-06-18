import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/http/api_client.dart';
import '../../board/models/board_position.dart';
import '../../board/models/chess_move.dart';
import '../models/game_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient());

final gameProvider =
    StateNotifierProvider<GameNotifier, AsyncValue<GameState>>((ref) {
  return GameNotifier(ref.read(apiClientProvider));
});

// ─── Notifier ─────────────────────────────────────────────────────────────────

class GameNotifier extends StateNotifier<AsyncValue<GameState>> {
  GameNotifier(this._api) : super(const AsyncValue.loading()) {
    state = AsyncValue.data(GameState.initial());
  }

  final ApiClient _api;

  // ─── Création ──────────────────────────────────────────────────────────────

  Future<void> createLocalGame({
    String timeControl = 'RAPID',
  }) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.createGame(
        mode: 'LOCAL',
        timeControl: timeControl,
      );
      state = AsyncValue.data(_fromServerData(data));
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  // ─── Interaction plateau ───────────────────────────────────────────────────

  /// Sélectionne [square] ou joue un coup si la case est une destination légale.
  void onSquareTap(String square) {
    final current = state.valueOrNull;
    if (current == null || current.isOver) return;

    final selected = current.selectedSquare;

    // Cas 1 : une pièce est déjà sélectionnée
    if (selected != null) {
      if (current.legalTargets.contains(square)) {
        _tryMove(selected, square, current);
        return;
      }
    }

    // Cas 2 : on clique sur une pièce du joueur courant
    final piece = current.position.pieceAt(square);
    final isCurrentPlayer = piece != null &&
        piece.startsWith(current.activeColor);

    if (isCurrentPlayer && current.moveMap.containsKey(square)) {
      state = AsyncValue.data(current.copyWith(
        selectedSquare: square,
        legalTargets: current.moveMap[square]!,
      ));
    } else {
      // Désélection
      state = AsyncValue.data(current.copyWith(clearSelected: true));
    }
  }

  /// Gère le dépôt d'une pièce glissée de [from] vers [to].
  void onPieceDrop(String from, String to) {
    final current = state.valueOrNull;
    if (current == null || current.isOver) return;
    if (current.moveMap[from]?.contains(to) ?? false) {
      _tryMove(from, to, current);
    }
  }

  // ─── Promotion ────────────────────────────────────────────────────────────

  /// Appelée quand l'utilisateur choisit la pièce de promotion.
  Future<void> confirmPromotion(String pieceType) async {
    final current = state.valueOrNull;
    if (current?.pendingPromotion == null) return;

    final from = current!.pendingPromotion!['from']!;
    final to   = current.pendingPromotion!['to']!;
    final uci  = '$from$to${pieceType.toLowerCase()}';

    state = AsyncValue.data(current.copyWith(clearPendingPromotion: true));
    await _sendMove(uci, current);
  }

  // ─── Abandon ──────────────────────────────────────────────────────────────

  Future<void> resign(String color) async {
    final current = state.valueOrNull;
    if (current?.gameId == null) return;
    try {
      await _api.resign(current!.gameId!, color);
      state = AsyncValue.data(current.copyWith(
        status: GameStatus.finished,
        result: color == 'white' ? 'BLACK_WIN' : 'WHITE_WIN',
        resultReason: 'RESIGNATION',
      ));
    } catch (e) {
      _setError('Erreur lors de l\'abandon : $e');
    }
  }

  // ─── Retourner le plateau ─────────────────────────────────────────────────

  void flipBoard() {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncValue.data(current.copyWith(isFlipped: !current.isFlipped));
  }

  // ─── Privé ────────────────────────────────────────────────────────────────

  void _tryMove(String from, String to, GameState current) {
    // Détecter si c'est une promotion (pion atteignant la dernière rangée)
    final piece = current.position.pieceAt(from);
    final isPromotion = piece != null &&
        piece.endsWith('P') &&
        ((piece.startsWith('w') && to.endsWith('8')) ||
            (piece.startsWith('b') && to.endsWith('1')));

    if (isPromotion) {
      // Afficher le sélecteur de promotion avant d'envoyer le coup
      state = AsyncValue.data(current.copyWith(
        pendingPromotion: {'from': from, 'to': to},
        clearSelected: true,
      ));
      return;
    }

    _sendMove('$from$to', current);
  }

  Future<void> _sendMove(String uci, GameState current) async {
    if (current.gameId == null) return;

    // Optimisme : désélectionner immédiatement
    state = AsyncValue.data(current.copyWith(clearSelected: true));

    try {
      final data = await _api.makeMove(current.gameId!, uci);
      final updated = _applyMoveResponse(current, data);
      state = AsyncValue.data(updated);
    } catch (e) {
      final msg = e is ApiException ? e.message : 'Coup refusé.';
      _setError(msg);
    }
  }

  // ─── Parsing des réponses serveur ─────────────────────────────────────────

  GameState _fromServerData(Map<String, dynamic> data) {
    final fen      = data['fen'] as String;
    final position = BoardPosition.fromFen(fen);
    final moves = (data['moves'] as List? ?? [])
        .cast<Map<String, dynamic>>()
        .map(ChessMove.fromJson)
        .toList();
    final legalMoves = (data['legalMoves'] as List? ?? []).cast<String>();
    final moveMap = BoardPosition.buildMoveMap(legalMoves);
    final clocks = data['clocks'] as Map<String, dynamic>? ?? {};
    final status = _parseStatus(data['status'] as String? ?? 'ONGOING');

    return GameState(
      gameId: data['id'] as String?,
      position: position,
      moves: moves,
      moveMap: moveMap,
      status: status,
      result: data['result'] as String?,
      resultReason: data['resultReason'] as String?,
      whiteTimeMs: (clocks['white'] as int?) ?? 0,
      blackTimeMs: (clocks['black'] as int?) ?? 0,
    );
  }

  GameState _applyMoveResponse(
    GameState current,
    Map<String, dynamic> data,
  ) {
    final moveData = data['move'] as Map<String, dynamic>? ?? {};
    final gameData = data['game'] as Map<String, dynamic>? ?? {};

    final move = ChessMove(
      ply: moveData['ply'] as int? ?? current.moves.length + 1,
      san: moveData['san'] as String? ?? '',
      uci: moveData['uci'] as String? ?? '',
      fenAfter: moveData['fenAfter'] as String? ?? current.position.toString(),
      isCheck: (moveData['isCheck'] as bool?) ?? false,
      isCheckmate: (moveData['isCheckmate'] as bool?) ?? false,
      isCapture: (moveData['isCapture'] as bool?) ?? false,
    );

    final newFen  = gameData['fen'] as String? ?? move.fenAfter;
    final position = BoardPosition.fromFen(newFen);
    final legalMoves = (gameData['legalMoves'] as List? ?? []).cast<String>();
    final moveMap = BoardPosition.buildMoveMap(legalMoves);
    final clocks = gameData['clocks'] as Map<String, dynamic>? ?? {};
    final status = _parseStatus(gameData['status'] as String? ?? 'ONGOING');

    return current.copyWith(
      position: position,
      moves: [...current.moves, move],
      moveMap: moveMap,
      lastMove: move,
      status: status,
      result: gameData['result'] as String?,
      resultReason: gameData['resultReason'] as String?,
      whiteTimeMs: (clocks['white'] as int?) ?? current.whiteTimeMs,
      blackTimeMs: (clocks['black'] as int?) ?? current.blackTimeMs,
      clearSelected: true,
      clearError: true,
    );
  }

  GameStatus _parseStatus(String s) {
    switch (s) {
      case 'ONGOING':
        return GameStatus.ongoing;
      case 'FINISHED':
        return GameStatus.finished;
      default:
        return GameStatus.waiting;
    }
  }

  void _setError(String message) {
    final current = state.valueOrNull ?? GameState.initial();
    state = AsyncValue.data(current.copyWith(error: message));
  }
}
