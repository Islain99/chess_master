import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/http/api_client.dart';
import '../../board/models/board_position.dart';
import '../../board/models/chess_move.dart';
import '../models/game_state.dart';

// ─── Providers ────────────────────────────────────────────────────────────────

// apiClientProvider est défini dans auth_provider.dart — il injecte le JWT si connecté.

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
  Timer? _clockTimer;

  @override
  void dispose() {
    _clockTimer?.cancel();
    super.dispose();
  }

  // ─── Horloge ────────────────────────────────────────────────────────────────

  void _startClock() {
    _clockTimer?.cancel();
    _clockTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      final current = state.valueOrNull;
      if (current == null || current.isOver || current.isAiThinking) return;
      if (current.activeColor == 'w') {
        final newMs = math.max(0, current.whiteTimeMs - 1000);
        state = AsyncValue.data(current.copyWith(whiteTimeMs: newMs));
      } else {
        final newMs = math.max(0, current.blackTimeMs - 1000);
        state = AsyncValue.data(current.copyWith(blackTimeMs: newMs));
      }
    });
  }

  void _stopClock() {
    _clockTimer?.cancel();
    _clockTimer = null;
  }

  // ─── Création ──────────────────────────────────────────────────────────────

  Future<void> createLocalGame({String timeControl = 'RAPID'}) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.createGame(mode: 'LOCAL', timeControl: timeControl);
      state = AsyncValue.data(_fromServerData(data));
      _startClock();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> createAiGame({
    required int aiLevel,
    String timeControl = 'RAPID',
    int? aiTargetElo,
  }) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.createGame(
        mode: 'AI',
        timeControl: timeControl,
        aiLevel: aiLevel,
        aiTargetElo: aiTargetElo,
      );
      final gameState = _fromServerData(data).copyWith(
        isAiMode: true,
        aiLevel: aiLevel,
      );
      state = AsyncValue.data(gameState);
      _startClock();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  // ─── Import ──────────────────────────────────────────────────────────────────

  Future<void> importFromFen(String fen) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.importGame(fen: fen);
      state = AsyncValue.data(_fromServerData(data));
      if (!(state.valueOrNull?.isOver ?? true)) _startClock();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> importFromPgn(String pgn) async {
    state = const AsyncValue.loading();
    try {
      final data = await _api.importGame(pgn: pgn);
      state = AsyncValue.data(_fromServerData(data));
      if (!(state.valueOrNull?.isOver ?? true)) _startClock();
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  // ─── Export PGN ──────────────────────────────────────────────────────────────

  Future<String?> exportPgn() async {
    final current = state.valueOrNull;
    if (current?.gameId == null) return null;
    try {
      final pgn = await _api.getPgn(current!.gameId!);
      await Clipboard.setData(ClipboardData(text: pgn));
      return pgn;
    } catch (e) {
      _setError('Impossible d\'exporter le PGN : $e');
      return null;
    }
  }

  // ─── Interaction plateau ───────────────────────────────────────────────────

  void onSquareTap(String square) {
    final current = state.valueOrNull;
    if (current == null || current.isOver || current.isAiThinking) return;

    final selected = current.selectedSquare;

    if (selected != null && current.legalTargets.contains(square)) {
      _tryMove(selected, square, current);
      return;
    }

    final piece = current.position.pieceAt(square);
    final isCurrentPlayer =
        piece != null && piece.startsWith(current.activeColor);

    if (isCurrentPlayer && current.moveMap.containsKey(square)) {
      state = AsyncValue.data(current.copyWith(
        selectedSquare: square,
        legalTargets: current.moveMap[square]!,
      ));
    } else {
      state = AsyncValue.data(current.copyWith(clearSelected: true));
    }
  }

  void onPieceDrop(String from, String to) {
    final current = state.valueOrNull;
    if (current == null || current.isOver || current.isAiThinking) return;
    if (current.moveMap[from]?.contains(to) ?? false) {
      _tryMove(from, to, current);
    }
  }

  // ─── Promotion ────────────────────────────────────────────────────────────

  Future<void> confirmPromotion(String pieceType) async {
    final current = state.valueOrNull;
    if (current?.pendingPromotion == null) return;

    final from = current!.pendingPromotion!['from']!;
    final to = current.pendingPromotion!['to']!;
    final uci = '$from$to${pieceType.toLowerCase()}';

    state = AsyncValue.data(current.copyWith(clearPendingPromotion: true));
    await _sendMove(uci, current);
  }

  // ─── Annulation ──────────────────────────────────────────────────────────────

  Future<void> undoMove() async {
    final current = state.valueOrNull;
    if (current?.gameId == null) return;
    _stopClock();
    try {
      final data = await _api.undoMove(current!.gameId!);
      state = AsyncValue.data(_fromServerData(data).copyWith(
        isAiMode: current.isAiMode,
        aiLevel: current.aiLevel,
      ));
      _startClock();
    } catch (e) {
      _setError(e is ApiException ? e.message : 'Annulation impossible.');
      _startClock();
    }
  }

  // ─── Abandon ──────────────────────────────────────────────────────────────

  Future<void> resign(String color) async {
    final current = state.valueOrNull;
    if (current?.gameId == null) return;
    _stopClock();
    try {
      await _api.resign(current!.gameId!, color);
      state = AsyncValue.data(current.copyWith(
        status: GameStatus.finished,
        result: color == 'white' ? 'BLACK_WIN' : 'WHITE_WIN',
        resultReason: 'RESIGNATION',
      ));
    } catch (e) {
      _setError('Erreur lors de l\'abandon : $e');
      _startClock();
    }
  }

  // ─── Nulle par accord ─────────────────────────────────────────────────────

  Future<void> acceptDraw() async {
    final current = state.valueOrNull;
    if (current?.gameId == null) return;
    _stopClock();
    try {
      await _api.acceptDraw(current!.gameId!);
      state = AsyncValue.data(current.copyWith(
        status: GameStatus.finished,
        result: 'DRAW',
        resultReason: 'DRAW_AGREEMENT',
      ));
    } catch (e) {
      _setError('Erreur nulle : $e');
      _startClock();
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
    final piece = current.position.pieceAt(from);
    final isPromotion = piece != null &&
        piece.endsWith('P') &&
        ((piece.startsWith('w') && to.endsWith('8')) ||
            (piece.startsWith('b') && to.endsWith('1')));

    if (isPromotion) {
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
    _stopClock();
    state = AsyncValue.data(current.copyWith(clearSelected: true));

    try {
      final data = await _api.makeMove(current.gameId!, uci);

      // 1. Appliquer le coup du joueur
      final afterPlayer = _applyMoveResponse(current, data);
      state = AsyncValue.data(afterPlayer);

      // 2. Gérer la réponse IA si présente
      final aiMoveData = data['aiMove'] as Map<String, dynamic>?;
      if (aiMoveData != null && !afterPlayer.isOver) {
        // Montrer "IA réfléchit..."
        state = AsyncValue.data(afterPlayer.copyWith(isAiThinking: true));
        await Future.delayed(const Duration(milliseconds: 600));

        // Appliquer le coup IA
        final afterAi = _applyAiMoveResponse(afterPlayer, data, aiMoveData);
        state = AsyncValue.data(afterAi);
      }

      if (!(state.valueOrNull?.isOver ?? true)) _startClock();
    } catch (e) {
      _setError(e is ApiException ? e.message : 'Coup refusé.');
      _startClock();
    }
  }

  // ─── Parsing ──────────────────────────────────────────────────────────────

  GameState _fromServerData(Map<String, dynamic> data) {
    final fen = data['fen'] as String;
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
      lastMove: moves.isNotEmpty ? moves.last : null,
      status: status,
      result: data['result'] as String?,
      resultReason: data['resultReason'] as String?,
      whiteTimeMs: (clocks['white'] as int?) ?? 0,
      blackTimeMs: (clocks['black'] as int?) ?? 0,
      isAiMode: (data['mode'] as String?) == 'AI',
      aiLevel: data['aiLevel'] as int?,
    );
  }

  GameState _applyMoveResponse(GameState current, Map<String, dynamic> data) {
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

    final newFen = gameData['fen'] as String? ?? move.fenAfter;
    final legalMoves = (gameData['legalMoves'] as List? ?? []).cast<String>();
    final clocks = gameData['clocks'] as Map<String, dynamic>? ?? {};
    final status = _parseStatus(gameData['status'] as String? ?? 'ONGOING');

    return current.copyWith(
      position: BoardPosition.fromFen(newFen),
      moves: [...current.moves, move],
      moveMap: BoardPosition.buildMoveMap(legalMoves),
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

  GameState _applyAiMoveResponse(
    GameState current,
    Map<String, dynamic> data,
    Map<String, dynamic> aiMoveData,
  ) {
    final gameData = data['game'] as Map<String, dynamic>? ?? {};

    final aiMove = ChessMove(
      ply: aiMoveData['ply'] as int? ?? current.moves.length + 1,
      san: aiMoveData['san'] as String? ?? '',
      uci: aiMoveData['uci'] as String? ?? '',
      fenAfter: aiMoveData['fenAfter'] as String? ?? current.position.toString(),
      isCheck: (aiMoveData['isCheck'] as bool?) ?? false,
      isCheckmate: (aiMoveData['isCheckmate'] as bool?) ?? false,
      isCapture: (aiMoveData['isCapture'] as bool?) ?? false,
    );

    final newFen = gameData['fen'] as String? ?? aiMove.fenAfter;
    final legalMoves = (gameData['legalMoves'] as List? ?? []).cast<String>();
    final clocks = gameData['clocks'] as Map<String, dynamic>? ?? {};
    final status = _parseStatus(gameData['status'] as String? ?? 'ONGOING');

    return current.copyWith(
      position: BoardPosition.fromFen(newFen),
      moves: [...current.moves, aiMove],
      moveMap: BoardPosition.buildMoveMap(legalMoves),
      lastMove: aiMove,
      status: status,
      result: gameData['result'] as String?,
      resultReason: gameData['resultReason'] as String?,
      whiteTimeMs: (clocks['white'] as int?) ?? current.whiteTimeMs,
      blackTimeMs: (clocks['black'] as int?) ?? current.blackTimeMs,
      isAiThinking: false,
      clearSelected: true,
    );
  }

  GameStatus _parseStatus(String s) {
    switch (s) {
      case 'ONGOING':  return GameStatus.ongoing;
      case 'FINISHED': return GameStatus.finished;
      default:         return GameStatus.waiting;
    }
  }

  void _setError(String message) {
    final current = state.valueOrNull ?? GameState.initial();
    state = AsyncValue.data(current.copyWith(error: message));
  }
}
