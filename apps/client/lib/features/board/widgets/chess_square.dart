import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'chess_piece.dart';

/// Case individuelle du plateau.
/// Gère le fond coloré, le highlight, les indicateurs de coup légal
/// et le rendu de la pièce.
class ChessSquare extends StatelessWidget {
  const ChessSquare({
    super.key,
    required this.square,
    required this.squareSize,
    this.pieceCode,
    this.isLight = true,
    this.isSelected = false,
    this.isLegalTarget = false,
    this.isLastMoveSrc = false,
    this.isLastMoveDst = false,
    this.isInCheck = false,
    this.onTap,
    this.onPieceDragStart,
    this.onPieceDrop,
  });

  final String square;
  final double squareSize;
  final String? pieceCode;
  final bool isLight;
  final bool isSelected;
  final bool isLegalTarget;
  final bool isLastMoveSrc;
  final bool isLastMoveDst;
  final bool isInCheck;
  final VoidCallback? onTap;
  final VoidCallback? onPieceDragStart;
  final void Function(String from)? onPieceDrop;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: DragTarget<String>(
        onAcceptWithDetails: (details) => onPieceDrop?.call(details.data),
        builder: (context, candidateData, rejectedData) {
          return Stack(
            children: [
              // ─── Fond de case ──────────────────────────────────────────
              Container(
                width: squareSize,
                height: squareSize,
                color: _backgroundColor(),
              ),

              // ─── Indicateur coup légal (point central) ──────────────────
              if (isLegalTarget && pieceCode == null)
                Center(
                  child: Container(
                    width: squareSize * 0.28,
                    height: squareSize * 0.28,
                    decoration: const BoxDecoration(
                      color: AppTheme.legalMoveDot,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),

              // ─── Indicateur coup légal (anneau si la case est occupée) ──
              if (isLegalTarget && pieceCode != null)
                Container(
                  width: squareSize,
                  height: squareSize,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: AppTheme.legalMoveDot,
                      width: squareSize * 0.08,
                    ),
                    shape: BoxShape.circle,
                  ),
                ),

              // ─── Pièce ──────────────────────────────────────────────────
              if (pieceCode != null)
                Center(
                  child: _buildDraggablePiece(),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildDraggablePiece() {
    final piece = ChessPieceWidget(
      pieceCode: pieceCode!,
      size: squareSize,
    );

    return Draggable<String>(
      data: square,
      onDragStarted: onPieceDragStart,
      feedback: Material(
        color: Colors.transparent,
        child: ChessPieceWidget(pieceCode: pieceCode!, size: squareSize * 1.2),
      ),
      childWhenDragging: Opacity(opacity: 0.3, child: piece),
      child: piece,
    );
  }

  Color _backgroundColor() {
    if (isInCheck) return AppTheme.inCheckSquare;
    if (isSelected) return AppTheme.selectedSquare;
    if (isLastMoveSrc || isLastMoveDst) return AppTheme.lastMoveHighlight;
    return isLight ? AppTheme.lightSquare : AppTheme.darkSquare;
  }
}
