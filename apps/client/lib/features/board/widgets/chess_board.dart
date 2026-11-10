import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/settings/board_theme.dart';
import '../../../core/settings/settings_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../models/board_position.dart';
import '../models/chess_move.dart';
import 'chess_piece.dart';
import 'chess_square.dart';

/// Plateau d'échecs interactif 8×8.
///
/// Les coordonnées (a–h, 1–8) sont insérées directement dans les cases
/// de bordure (coin supérieur-gauche pour les rangées, coin inférieur-droit
/// pour les colonnes), à la manière de Chess.com — sans modifier le ratio 1:1.
///
/// Sprint 20 : les réglages « Thème du plateau », « Afficher les coordonnées »
/// et « Afficher les coups légaux » étaient enregistrés mais jamais appliqués
/// (le plateau restait Classique, coordonnées et points toujours visibles).
/// Ils sont lus ici, sur tous les plateaux (partie, en ligne, lecteur).
class ChessBoardWidget extends ConsumerWidget {
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
    this.boardTheme,
  });

  final BoardPosition position;
  final void Function(String square) onSquareTap;
  final void Function(String from, String to) onPieceDrop;
  final String? selectedSquare;
  final Set<String> legalTargets;
  final ChessMove? lastMove;
  final String? inCheckSquare;
  final bool flipped;

  /// Thème imposé (aperçu) ; sinon celui des réglages.
  final BoardTheme? boardTheme;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final theme = boardTheme ?? settings.boardTheme;
    final targets = settings.showLegalMoves ? legalTargets : const <String>{};
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
                  return _buildSquare(
                    square, squareSize, rowIdx, colIdx,
                    theme: theme,
                    targets: targets,
                    showCoordinates: settings.showCoordinates,
                  );
                }),
              );
            }),
          );
        },
      ),
    );
  }

  Widget _buildSquare(
    String square,
    double size,
    int rowIdx,
    int colIdx, {
    required BoardTheme theme,
    required Set<String> targets,
    required bool showCoordinates,
  }) {
    final file = square[0];
    final rank = int.parse(square[1]);
    // Sprint 20 : a1 est une case FONCÉE (« blanc à droite »). La formule
    // précédente ((colonne + rangée) % 2 == 1, colonne comptée depuis 0)
    // inversait toutes les couleurs du plateau.
    final isLight = isLightSquare(square);
    final piece = position.pieceAt(square);

    // Coordonnées : rangée = colonne 0 en mode normal (colonne 7 en retourné)
    //               colonne = ligne 7 en mode normal (ligne 0 en retourné)
    final bool showRank = showCoordinates && (flipped ? (colIdx == 7) : (colIdx == 0));
    final bool showFile = showCoordinates && (flipped ? (rowIdx == 0) : (rowIdx == 7));

    return ChessSquare(
      square: square,
      squareSize: size,
      pieceCode: piece,
      isLight: isLight,
      isSelected: selectedSquare == square,
      isLegalTarget: targets.contains(square),
      isLastMoveSrc: lastMove?.from == square,
      isLastMoveDst: lastMove?.to == square,
      isInCheck: inCheckSquare == square,
      rankLabel: showRank ? '$rank' : null,
      fileLabel: showFile ? file : null,
      onTap: () => onSquareTap(square),
      onPieceDrop: (from) => onPieceDrop(from, square),
      boardTheme: theme,
    );
  }

  /// Case claire ? a1 foncée, h1 claire, a8 claire (colonne + rangée paire,
  /// colonne a = 1).
  static bool isLightSquare(String square) {
    final file = square.codeUnitAt(0) - 'a'.codeUnitAt(0) + 1;
    final rank = int.parse(square[1]);
    return (file + rank) % 2 == 1;
  }

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
                return GestureDetector(
                  key: ValueKey('promotion-${p.toLowerCase()}'),
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
                    // Polissage : mêmes pièces que sur le plateau (style choisi
                    // dans les Paramètres) au lieu de glyphes à part.
                    alignment: Alignment.center,
                    child: ChessPieceWidget(pieceCode: '$color$p', size: 52),
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
