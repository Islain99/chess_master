import '../../../features/board/models/board_position.dart';
import '../../../features/board/models/chess_move.dart';

enum GameStatus { waiting, ongoing, finished }

/// État complet d'une partie, géré par [GameNotifier].
class GameState {
  const GameState({
    this.gameId,
    required this.position,
    this.moves = const [],
    this.selectedSquare,
    this.legalTargets = const {},
    this.moveMap = const {},
    this.lastMove,
    this.status = GameStatus.waiting,
    this.result,
    this.resultReason,
    this.whiteTimeMs = 0,
    this.blackTimeMs = 0,
    this.isFlipped = false,
    this.pendingPromotion,
    this.error,
  });

  final String? gameId;
  final BoardPosition position;
  final List<ChessMove> moves;

  // Interaction plateau
  final String? selectedSquare;
  final Set<String> legalTargets;
  /// Dictionnaire from → {to} pour toutes les pièces du joueur courant.
  final Map<String, Set<String>> moveMap;
  final ChessMove? lastMove;

  // Fin de partie
  final GameStatus status;
  final String? result;
  final String? resultReason;

  // Horloges (ms restantes)
  final int whiteTimeMs;
  final int blackTimeMs;

  // UI
  final bool isFlipped;

  /// Promotion en attente : {from, to} — affiché en modal avant l'envoi.
  final Map<String, String>? pendingPromotion;

  /// Message d'erreur à afficher brièvement.
  final String? error;

  /// "w" ou "b" selon le trait courant.
  String get activeColor => position.activeColor;

  bool get isOver => status == GameStatus.finished;

  GameState copyWith({
    String? gameId,
    BoardPosition? position,
    List<ChessMove>? moves,
    String? selectedSquare,
    Set<String>? legalTargets,
    Map<String, Set<String>>? moveMap,
    ChessMove? lastMove,
    GameStatus? status,
    String? result,
    String? resultReason,
    int? whiteTimeMs,
    int? blackTimeMs,
    bool? isFlipped,
    Map<String, String>? pendingPromotion,
    String? error,
    bool clearSelected = false,
    bool clearError = false,
    bool clearPendingPromotion = false,
  }) {
    return GameState(
      gameId: gameId ?? this.gameId,
      position: position ?? this.position,
      moves: moves ?? this.moves,
      selectedSquare: clearSelected ? null : (selectedSquare ?? this.selectedSquare),
      legalTargets: clearSelected ? {} : (legalTargets ?? this.legalTargets),
      moveMap: moveMap ?? this.moveMap,
      lastMove: lastMove ?? this.lastMove,
      status: status ?? this.status,
      result: result ?? this.result,
      resultReason: resultReason ?? this.resultReason,
      whiteTimeMs: whiteTimeMs ?? this.whiteTimeMs,
      blackTimeMs: blackTimeMs ?? this.blackTimeMs,
      isFlipped: isFlipped ?? this.isFlipped,
      pendingPromotion: clearPendingPromotion ? null : (pendingPromotion ?? this.pendingPromotion),
      error: clearError ? null : (error ?? this.error),
    );
  }

  static GameState initial() => GameState(
        position: BoardPosition.initial(),
      );
}
