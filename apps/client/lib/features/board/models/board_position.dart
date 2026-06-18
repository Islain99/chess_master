/// Représente la position des pièces sur l'échiquier,
/// parsée depuis une chaîne FEN.
class BoardPosition {
  const BoardPosition({
    required this.pieces,
    required this.activeColor,
    required this.castling,
    required this.enPassant,
    required this.halfmoveClock,
    required this.fullmoveNumber,
  });

  /// Dictionnaire case → code pièce.
  /// Clé : notation algébrique (ex. "e1").
  /// Valeur : "wK", "bP", etc. (couleur + type).
  final Map<String, String> pieces;

  /// "w" ou "b" — joueur dont c'est le trait.
  final String activeColor;
  final String castling;
  final String enPassant;
  final int halfmoveClock;
  final int fullmoveNumber;

  static const String initialFen =
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /// Parse un FEN complet en [BoardPosition].
  factory BoardPosition.fromFen(String fen) {
    final parts = fen.trim().split(' ');
    if (parts.isEmpty) return BoardPosition.initial();

    final rankStrings = parts[0].split('/');
    final pieces = <String, String>{};

    // FEN décrit le plateau de la rangée 8 (haut) à la rangée 1 (bas)
    for (int rankIdx = 0; rankIdx < 8 && rankIdx < rankStrings.length; rankIdx++) {
      final rank = 8 - rankIdx;
      int fileIdx = 0;
      for (final char in rankStrings[rankIdx].split('')) {
        final n = int.tryParse(char);
        if (n != null) {
          fileIdx += n;
        } else {
          final file = String.fromCharCode('a'.codeUnitAt(0) + fileIdx);
          final square = '$file$rank';
          final color = char == char.toUpperCase() ? 'w' : 'b';
          pieces[square] = '$color${char.toUpperCase()}';
          fileIdx++;
        }
      }
    }

    return BoardPosition(
      pieces: pieces,
      activeColor: parts.length > 1 ? parts[1] : 'w',
      castling: parts.length > 2 ? parts[2] : 'KQkq',
      enPassant: parts.length > 3 ? parts[3] : '-',
      halfmoveClock: parts.length > 4 ? (int.tryParse(parts[4]) ?? 0) : 0,
      fullmoveNumber: parts.length > 5 ? (int.tryParse(parts[5]) ?? 1) : 1,
    );
  }

  factory BoardPosition.initial() => BoardPosition.fromFen(initialFen);

  /// Retourne le code pièce sur [square] ou null si la case est vide.
  String? pieceAt(String square) => pieces[square];

  /// Construit un dictionnaire de départ → {destinations} depuis les coups légaux UCI.
  /// Exemple d'entrée : ["e2e4", "e2e3", "d2d4", ...].
  static Map<String, Set<String>> buildMoveMap(List<String> legalMoves) {
    final map = <String, Set<String>>{};
    for (final uci in legalMoves) {
      if (uci.length < 4) continue;
      final from = uci.substring(0, 2);
      final to   = uci.substring(2, 4);
      map.putIfAbsent(from, () => {}).add(to);
    }
    return map;
  }

  @override
  String toString() => 'BoardPosition(active: $activeColor, pieces: ${pieces.length})';
}
