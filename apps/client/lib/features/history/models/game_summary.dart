// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Résumé d'une partie de l'historique (GET /users/:id/games)
// ─────────────────────────────────────────────────────────────────────────────

class GameSummary {
  const GameSummary({
    required this.id,
    required this.mode,
    required this.timeControl,
    required this.status,
    required this.color,
    required this.moveCount,
    required this.createdAt,
    this.outcome,
    this.result,
    this.resultReason,
    this.opponentName,
    this.opponentAvatarUrl,
    this.aiLevel,
  });

  final String id;
  final String mode;
  final String timeControl;
  final String status;

  /// Couleur du joueur : « white » ou « black ».
  final String color;

  /// win, loss, draw — null tant que la partie n'est pas terminée.
  final String? outcome;

  /// Résultat brut : WHITE_WIN, BLACK_WIN, DRAW (null si en cours).
  /// Sert aux parties locales, qui n'ont pas d'issue « pour le joueur ».
  final String? result;
  final String? resultReason;
  final String? opponentName;
  final String? opponentAvatarUrl;
  final int? aiLevel;
  final int moveCount;
  final DateTime createdAt;

  bool get isOngoing => status == 'ONGOING' || status == 'WAITING';
  bool get isOnline => mode == 'PRIVATE' || mode == 'MATCHMAKING';

  String get opponentLabel {
    if (opponentName != null) return opponentName!;
    if (mode == 'AI') return 'IA niveau ${aiLevel ?? '?'}';
    if (mode == 'PRIVATE' && status == 'WAITING') return 'En attente d\'un adversaire';
    // Novembre 2026 : adversaire en ligne dont le compte a été supprimé.
    if (isOnline) return 'Compte supprimé';
    return 'Partie locale';
  }

  String get modeLabel => switch (mode) {
        'MATCHMAKING' => 'Classée',
        'PRIVATE' => 'Salle privée',
        'AI' => 'IA',
        _ => 'Locale',
      };

  String get timeControlLabel => switch (timeControl) {
        'BULLET' => 'Bullet',
        'BLITZ' => 'Blitz',
        'RAPID' => 'Rapide',
        'CLASSICAL' => 'Classique',
        _ => timeControl,
      };

  factory GameSummary.fromJson(Map<String, dynamic> json) {
    final opponent = json['opponent'] as Map<String, dynamic>?;
    final isUser = opponent?['type'] == 'user';
    return GameSummary(
      id: json['id'] as String,
      mode: json['mode'] as String? ?? 'LOCAL',
      timeControl: json['timeControl'] as String? ?? 'RAPID',
      status: json['status'] as String? ?? 'FINISHED',
      color: json['color'] as String? ?? 'white',
      outcome: json['outcome'] as String?,
      result: json['result'] as String?,
      resultReason: json['resultReason'] as String?,
      opponentName: isUser ? opponent!['displayName'] as String? : null,
      opponentAvatarUrl: isUser ? opponent!['avatarUrl'] as String? : null,
      aiLevel: opponent?['type'] == 'ai' ? (opponent!['level'] as num?)?.toInt() : null,
      moveCount: (json['moveCount'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
    );
  }
}
