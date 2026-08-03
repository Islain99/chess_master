import 'package:flutter/material.dart';
import '../models/board_position.dart';
import '../models/chess_move.dart';
import 'chess_square.dart';

/// Plateau d'échecs interactif 8×8.
///
/// Les coordonnées (a–h, 1–8) sont insérées directement dans les cases
/// de bordure (coin supérieur-gauche pour les rangées, coin inférieur-droit
/// pour les colonnes), à la manière de Chess.com — sans modifier le ratio 1:1.
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
  });

  final BoardPosition position;
  final void Function(String square) onSquareTap;
  final void Function(String from, String to) onPieceDrop;
  final String? selectedSquare;
  final Set<String> legalTargets;
  final ChessMove? lastMove;
  final String? inCheckSquare;
  final bool flipped;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final squareSize = constraints.maxWidth / 8;
          return Column(
            children: List.generate(8, (rowIdx) {
              return Row(
                children: List.generate(8, (colIdx) {
                  final square = _squareAt(rowIdx, colIdx);
                  return _buildSquare(square, squareSize, rowIdx, colIdx);
                }),
              );
            }),
          );
        },
      ),
    );
  }

  Widget _buildSquare(String square, double size, int rowIdx, int colIdx) {
    final file = square[0];
    final rank = int.parse(square[1]);
    final fileIdx = file.codeUnitAt(0) - 'a'.codeUnitAt(0);
    final isLight = (fileIdx + rank) % 2 == 1;
    final piece = position.pieceAt(square);

    // Coordonnées : rangée = colonne 0 en mode normal (colonne 7 en retourné)
    //               colonne = ligne 7 en mode normal (ligne 0 en retourné)
    final bool showRank = flipped ? (colIdx == 7) : (colIdx == 0);
    final bool showFile = flipped ? (rowIdx == 0) : (rowIdx == 7);

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
      rankLabel: showRank ? '$rank' : null,
      fileLabel: showFile ? file : null,
      onTap: () => onSquareTap(square),
      onPieceDrop: (from) => onPieceDrop(from, square),
    );
  }

  String _squareAt(int rowIdx, int colIdx) {
    final rank = flipped ? (rowIdx + 1) : (8 - rowIdx);
    final fileIdx = flipped ? (7 - colIdx) : colIdx;
    final file = String.fromCharCode('a'.codeUnitAt(0) + fileIdx);
    return '$file$rank';
  }
}

// ─── Sélecteur de promotion ───────────────────────────────────────────────────

import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/settings/settings_provider.dart';
import '../../../core/theme/board_themes.dart';

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
  static const _labels = {'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞'};
  static const _labelsWhite = {'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘'};

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
              style: TextStyle(color: Colors.white, fontSize: 18,
                  fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: _pieces.map((p) {
                final symbols = color == 'w' ? _labelsWhite : _labels;
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
                        symbols[p] ?? p,
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
