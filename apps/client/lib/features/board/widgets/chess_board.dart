import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../models/board_position.dart';
import '../models/chess_move.dart';
import 'chess_square.dart';

/// Plateau d'échecs interactif 8×8.
///
/// Responsabilités :
/// - Afficher les 64 cases et les pièces dans la position [position].
/// - Mettre en évidence la case [selectedSquare], les [legalTargets]
///   et le dernier coup [lastMove].
/// - Émettre [onSquareTap] lors d'un tap et [onPieceDrop] lors d'un drag.
/// - Retourner le plateau quand [flipped] est vrai.
class ChessBoardWidget extends StatelessWidget {
  const ChessBoardWidget({
    super.key,
    required this.position,
    required this.onSquareTap,
    required this.onPieceDrop,
    this.selectedSquare,
    this.legalTargets = const {},
    this.lastMove,
    this.inCheckSquare,
    this.flipped = false,
    this.showCoordinates = true,
  });

  final BoardPosition position;
  final void Function(String square) onSquareTap;
  final void Function(String from, String to) onPieceDrop;
  final String? selectedSquare;
  final Set<String> legalTargets;
  final ChessMove? lastMove;
  final String? inCheckSquare;
  final bool flipped;
  final bool showCoordinates;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final size = constraints.maxWidth;
          final coordWidth = showCoordinates ? 18.0 : 0.0;
          final boardSize = size - coordWidth;
          final squareSize = boardSize / 8;

          return Row(
            children: [
              // ─── Labels de rangée (1–8) ───────────────────────────────
              if (showCoordinates)
                SizedBox(
                  width: coordWidth,
                  child: Column(
                    children: List.generate(8, (i) {
                      final rank = flipped ? (i + 1) : (8 - i);
                      return SizedBox(
                        height: squareSize,
                        child: Center(
                          child: Text(
                            '$rank',
                            style: TextStyle(
                              fontSize: 10,
                              color: Colors.white.withOpacity(0.5),
                            ),
                          ),
                        ),
                      );
                    }),
                  ),
                ),

              // ─── Grille 8×8 ───────────────────────────────────────────
              SizedBox(
                width: boardSize,
                height: boardSize,
                child: Column(
                  children: [
                    ...List.generate(8, (rowIdx) {
                      return Row(
                        children: List.generate(8, (colIdx) {
                          final square = _squareAt(rowIdx, colIdx);
                          return _buildSquare(square, squareSize);
                        }),
                      );
                    }),

                    // ─── Labels de colonne (a–h) ──────────────────────
                    if (showCoordinates)
                      SizedBox(
                        height: 0, // occupé par les labels en dehors
                      ),
                  ],
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSquare(String square, double size) {
    final file = square[0];
    final rank = int.parse(square[1]);
    final fileIdx = file.codeUnitAt(0) - 'a'.codeUnitAt(0);
    final isLight = (fileIdx + rank) % 2 == 1;
    final piece = position.pieceAt(square);

    return ChessSquare(
      square: square,
      squareSize: size,
      pieceCode: piece,
      isLight: isLight,
      isSelected: selectedSquare == square,
      isLegalTarget: legalTargets.contains(square),
      isLastMoveSrc: lastMove?.from == square,
      isLastMoveDst: lastMove?.to == square,
      isInCheck: inCheckSquare == square,
      onTap: () => onSquareTap(square),
      onPieceDrop: (from) => onPieceDrop(from, square),
    );
  }

  /// Retourne la case en notation algébrique pour la cellule [rowIdx][colIdx],
  /// en tenant compte du retournement du plateau.
  String _squareAt(int rowIdx, int colIdx) {
    final rank = flipped ? (rowIdx + 1) : (8 - rowIdx);
    final fileIdx = flipped ? (7 - colIdx) : colIdx;
    final file = String.fromCharCode('a'.codeUnitAt(0) + fileIdx);
    return '$file$rank';
  }
}

// ─── Sélecteur de promotion ───────────────────────────────────────────────────

/// Modal affiché quand un pion atteint la dernière rangée.
class PromotionDialog extends StatelessWidget {
  const PromotionDialog({
    super.key,
    required this.color,
    required this.onSelect,
  });

  final String color; // "w" ou "b"
  final void Function(String pieceType) onSelect;

  static const _pieces = ['Q', 'R', 'B', 'N'];
  static const _unicode = {
    'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘',
    'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞',
  };

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppTheme.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              'Promotion',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: _pieces.map((p) {
                final code = '$color$p';
                return GestureDetector(
                  onTap: () {
                    Navigator.of(context).pop();
                    onSelect(p.toLowerCase());
                  },
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppTheme.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Center(
                      child: Text(
                        _unicode[code] ?? p,
                        style: TextStyle(
                          fontSize: 36,
                          color: color == 'w' ? Colors.white : Colors.black,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
        ),
      ),
    );
  }
}
