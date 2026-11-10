import 'package:flutter/material.dart';
import '../../../core/settings/board_theme.dart';
import 'chess_piece.dart';

/// Case individuelle du plateau.
/// Gère le fond coloré, les highlights, les indicateurs de coup légal,
/// les étiquettes de coordonnées intégrées et le rendu de la pièce.
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
    // Étiquettes de coordonnées insérées dans le coin de la case
    this.rankLabel,  // ex. "1" – coin supérieur gauche
    this.fileLabel,  // ex. "a" – coin inférieur droit
    this.onTap,
    this.onPieceDragStart,
    this.onPieceDrop,
    this.boardTheme = BoardTheme.classic,
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
  final String? rankLabel;
  final String? fileLabel;
  final VoidCallback? onTap;
  final VoidCallback? onPieceDragStart;
  final void Function(String from)? onPieceDrop;
  final BoardTheme boardTheme;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: DragTarget<String>(
        onAcceptWithDetails: (details) => onPieceDrop?.call(details.data),
        builder: (context, candidateData, _) {
          // Polissage : la case est posée dans une Row, qui laisse sa largeur
          // libre. Le Center se réduisait alors à la taille de son enfant et
          // le Stack (aligné en haut à gauche par défaut) collait pièces et
          // points de coup légal dans le coin supérieur gauche. Taille fixée
          // + alignement centré : tout est centré dans la case.
          return SizedBox.square(
            dimension: squareSize,
            child: Stack(
            alignment: Alignment.center,
            children: [
              // ─── Fond de case ──────────────────────────────────────────
              Container(
                width: squareSize,
                height: squareSize,
                color: _backgroundColor(),
              ),

              // ─── Indicateur coup légal (point — case vide) ──────────────
              if (isLegalTarget && pieceCode == null)
                Center(
                  child: Container(
                    width: squareSize * 0.28,
                    height: squareSize * 0.28,
                    decoration: BoxDecoration(
                      color: boardTheme.legalDot,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),

              // ─── Indicateur coup légal (anneau — case occupée) ──────────
              if (isLegalTarget && pieceCode != null)
                Container(
                  width: squareSize,
                  height: squareSize,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: boardTheme.legalDot,
                      width: squareSize * 0.08,
                    ),
                    shape: BoxShape.circle,
                  ),
                ),

              // ─── Pièce ──────────────────────────────────────────────────
              if (pieceCode != null)
                Center(child: _buildDraggablePiece()),

              // ─── Numéro de rangée (coin supérieur gauche) ───────────────
              if (rankLabel != null)
                Positioned(
                  top: 2,
                  left: 3,
                  child: Text(
                    rankLabel!,
                    style: TextStyle(
                      fontSize: squareSize * 0.18,
                      fontWeight: FontWeight.w600,
                      color: _coordColor(),
                    ),
                  ),
                ),

              // ─── Lettre de colonne (coin inférieur droit) ───────────────
              if (fileLabel != null)
                Positioned(
                  bottom: 2,
                  right: 3,
                  child: Text(
                    fileLabel!,
                    style: TextStyle(
                      fontSize: squareSize * 0.18,
                      fontWeight: FontWeight.w600,
                      color: _coordColor(),
                    ),
                  ),
                ),
            ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildDraggablePiece() {
    final piece = ChessPieceWidget(pieceCode: pieceCode!, size: squareSize);
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
    if (isInCheck) return boardTheme.inCheck;
    if (isSelected) return boardTheme.selectedSquare;
    if (isLastMoveSrc || isLastMoveDst) return boardTheme.lastMove;
    return isLight ? boardTheme.lightSquare : boardTheme.darkSquare;
  }

  /// Les coordonnées contrastent avec la couleur de la case (sprint 20 :
  /// couleurs du thème choisi, et plus celles du thème Classique).
  Color _coordColor() => isLight ? boardTheme.darkSquare : boardTheme.lightSquare;
}
