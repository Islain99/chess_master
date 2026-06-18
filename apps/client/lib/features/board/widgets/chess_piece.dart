import 'package:flutter/material.dart';

/// Affiche une pièce d'échecs en Unicode avec un style adapté à la couleur.
/// Sprint 1 : rendu Unicode. Sprint 9 : remplacement par des SVG/images.
class ChessPieceWidget extends StatelessWidget {
  const ChessPieceWidget({
    super.key,
    required this.pieceCode,
    this.size = 42.0,
  });

  /// Code pièce (ex. "wK", "bP") tel que retourné par [BoardPosition].
  final String pieceCode;
  final double size;

  static const Map<String, String> _unicode = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟',
  };

  @override
  Widget build(BuildContext context) {
    final symbol = _unicode[pieceCode];
    if (symbol == null) return const SizedBox.shrink();

    final isWhite = pieceCode.startsWith('w');

    return Text(
      symbol,
      style: TextStyle(
        fontSize: size * 0.72,
        color: isWhite ? Colors.white : Colors.black,
        shadows: isWhite
            ? const [
                Shadow(color: Colors.black54, blurRadius: 2),
                Shadow(color: Colors.black38, blurRadius: 4),
              ]
            : const [
                Shadow(color: Colors.white60, blurRadius: 2),
                Shadow(color: Colors.white38, blurRadius: 4),
              ],
      ),
    );
  }
}
