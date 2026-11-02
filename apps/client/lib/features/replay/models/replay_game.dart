// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Modèle du lecteur de partie (navigation coup par coup)
// ─────────────────────────────────────────────────────────────────────────────
import '../../board/models/chess_move.dart';

/// Partie chargée depuis GET /games/:id, prête à être rejouée.
class ReplayGame {
  const ReplayGame({
    required this.id,
    required this.initialFen,
    required this.moves,
    required this.status,
    this.mode,
    this.result,
    this.resultReason,
    this.whitePlayerId,
    this.blackPlayerId,
  });

  final String id;
  final String initialFen;
  final List<ChessMove> moves;
  final String status;
  final String? mode;
  final String? result;
  final String? resultReason;
  final String? whitePlayerId;
  final String? blackPlayerId;

  factory ReplayGame.fromJson(Map<String, dynamic> json) => ReplayGame(
        id: json['id'] as String,
        initialFen: json['initialFen'] as String? ??
            'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        moves: (json['moves'] as List? ?? [])
            .cast<Map<String, dynamic>>()
            .map(ChessMove.fromJson)
            .toList(),
        status: json['status'] as String? ?? 'FINISHED',
        mode: json['mode'] as String?,
        result: json['result'] as String?,
        resultReason: json['resultReason'] as String?,
        whitePlayerId: json['whitePlayerId'] as String?,
        blackPlayerId: json['blackPlayerId'] as String?,
      );

  bool get isFinished => status == 'FINISHED';

  /// Nombre de demi-coups ; les positions vont de 0 (départ) à [plyCount].
  int get plyCount => moves.length;

  /// Les blancs ont-ils le trait au départ ? (FEN importé possible)
  bool get whiteStarts => initialFen.split(' ').elementAtOrNull(1) != 'b';

  /// Position après `ply` demi-coups (0 = position initiale).
  String fenAt(int ply) => ply <= 0 ? initialFen : moves[clampPly(ply) - 1].fenAfter;

  /// Coup qui a mené à la position `ply` (null au départ).
  ChessMove? moveAt(int ply) => ply <= 0 ? null : moves[clampPly(ply) - 1];

  int clampPly(int ply) => ply.clamp(0, plyCount);

  /// Numérotation PGN : « 12. » pour les blancs, « 12… » pour les noirs.
  String moveNumberLabel(int ply) {
    final fullmove = int.tryParse(initialFen.split(' ').elementAtOrNull(5) ?? '') ?? 1;
    // Demi-coups depuis un départ aux blancs (un départ aux noirs décale d'un).
    final offset = whiteStarts ? ply - 1 : ply;
    final number = fullmove + offset ~/ 2;
    return offset.isEven ? '$number.' : '$number…';
  }
}
