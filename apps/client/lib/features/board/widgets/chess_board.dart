import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/audio/sound_service.dart';
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
class ChessBoardWidget extends ConsumerStatefulWidget {
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

  /// Durée du glissement d'une pièce (réglage « Animer les coups »).
  static const animationDuration = Duration(milliseconds: 180);

  /// Case claire ? a1 foncée, h1 claire, a8 claire (colonne + rangée paire,
  /// colonne a = 1).
  static bool isLightSquare(String square) {
    final file = square.codeUnitAt(0) - 'a'.codeUnitAt(0) + 1;
    final rank = int.parse(square[1]);
    return (file + rank) % 2 == 1;
  }

  @override
  ConsumerState<ChessBoardWidget> createState() => _ChessBoardWidgetState();
}

/// Polissage : le réglage « Animer les coups » était enregistré mais jamais
/// appliqué. Quand un NOUVEAU coup arrive (demi-coup suivant : coup de
/// l'adversaire, de l'IA, clic case par case, avance dans le lecteur), la
/// pièce glisse de sa case de départ à sa case d'arrivée. Elle est dessinée
/// dans une couche AU-DESSUS de la grille (sinon les cases peintes après
/// elle la masqueraient). Pas d'animation pour un coup déposé à la souris
/// (la pièce est déjà à sa place), ni en reculant ou en reprenant une partie.
class _ChessBoardWidgetState extends ConsumerState<ChessBoardWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: ChessBoardWidget.animationDuration,
  )..addStatusListener((status) {
      if (status == AnimationStatus.completed && mounted) {
        setState(() => _animMove = null);
      }
    });

  /// Coup en cours d'animation et pièce qui glisse.
  ChessMove? _animMove;
  String? _animPiece;

  /// Case où l'utilisateur vient de déposer une pièce (coup déjà « vu »).
  String? _droppedTo;

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(covariant ChessBoardWidget old) {
    super.didUpdateWidget(old);
    final move = widget.lastMove;
    final prev = old.lastMove;
    // L'horloge reconstruit l'écran chaque seconde : n'agir que si le
    // dernier coup a réellement changé.
    if (move?.ply == prev?.ply && move?.uci == prev?.uci) return;

    final dropped = move != null && _droppedTo == move.to;
    _droppedTo = null;
    final isNextMove = move != null && move.ply == (prev?.ply ?? 0) + 1;

    // Effets sonores : chaque nouveau coup, déposé à la souris ou non
    // (le service ne fait rien si le réglage est désactivé).
    if (isNextMove) ref.read(soundServiceProvider).play(GameSound.forMove(move!));
    final piece = move == null ? null : widget.position.pieceAt(move.to);

    if (!isNextMove || dropped || piece == null || !ref.read(settingsProvider).animateMoves) {
      _anim.stop();
      _animMove = null;
      return;
    }
    _animMove = move;
    _animPiece = piece;
    _anim.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final settings = ref.watch(settingsProvider);
    final theme = widget.boardTheme ?? settings.boardTheme;
    final targets = settings.showLegalMoves ? widget.legalTargets : const <String>{};
    return AspectRatio(
      aspectRatio: 1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final squareSize = constraints.maxWidth / 8;
          return AnimatedBuilder(
            animation: _anim,
            builder: (context, _) {
              final moving = _animMove;
              return Stack(
                children: [
                  Column(
                    children: List.generate(8, (rowIdx) {
                      return Row(
                        children: List.generate(8, (colIdx) {
                          final square = _squareAt(rowIdx, colIdx);
                          return _buildSquare(
                            square, squareSize, rowIdx, colIdx,
                            theme: theme,
                            targets: targets,
                            showCoordinates: settings.showCoordinates,
                            // Pendant le glissement, la case d'arrivée est vide.
                            hidePiece: moving != null && square == moving.to,
                          );
                        }),
                      );
                    }),
                  ),
                  if (moving != null && _animPiece != null)
                    _slidingPiece(moving, _animPiece!, squareSize),
                ],
              );
            },
          );
        },
      ),
    );
  }

  Widget _slidingPiece(ChessMove move, String piece, double size) {
    final t = Curves.easeOutCubic.transform(_anim.value);
    final (fromRow, fromCol) = _cellOf(move.from);
    final (toRow, toCol) = _cellOf(move.to);
    return Positioned(
      left: (fromCol + (toCol - fromCol) * t) * size,
      top: (fromRow + (toRow - fromRow) * t) * size,
      width: size,
      height: size,
      child: IgnorePointer(
        child: Center(child: ChessPieceWidget(pieceCode: piece, size: size)),
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
    bool hidePiece = false,
  }) {
    final file = square[0];
    final rank = int.parse(square[1]);
    // Sprint 20 : a1 est une case FONCÉE (« blanc à droite »). La formule
    // précédente ((colonne + rangée) % 2 == 1, colonne comptée depuis 0)
    // inversait toutes les couleurs du plateau.
    final isLight = ChessBoardWidget.isLightSquare(square);
    final piece = hidePiece ? null : widget.position.pieceAt(square);
    final flipped = widget.flipped;
    final lastMove = widget.lastMove;

    // Coordonnées : rangée = colonne 0 en mode normal (colonne 7 en retourné)
    //               colonne = ligne 7 en mode normal (ligne 0 en retourné)
    final bool showRank = showCoordinates && (flipped ? (colIdx == 7) : (colIdx == 0));
    final bool showFile = showCoordinates && (flipped ? (rowIdx == 0) : (rowIdx == 7));

    return ChessSquare(
      square: square,
      squareSize: size,
      pieceCode: piece,
      isLight: isLight,
      isSelected: widget.selectedSquare == square,
      isLegalTarget: targets.contains(square),
      isLastMoveSrc: lastMove?.from == square,
      isLastMoveDst: lastMove?.to == square,
      isInCheck: widget.inCheckSquare == square,
      rankLabel: showRank ? '$rank' : null,
      fileLabel: showFile ? file : null,
      onTap: () => widget.onSquareTap(square),
      onPieceDrop: (from) {
        _droppedTo = square;
        widget.onPieceDrop(from, square);
      },
      boardTheme: theme,
    );
  }

  String _squareAt(int rowIdx, int colIdx) {
    final rank = widget.flipped ? (rowIdx + 1) : (8 - rowIdx);
    final fileIdx = widget.flipped ? (7 - colIdx) : colIdx;
    final file = String.fromCharCode('a'.codeUnitAt(0) + fileIdx);
    return '$file$rank';
  }

  /// (ligne, colonne) d'une case à l'écran — inverse de [_squareAt].
  (int, int) _cellOf(String square) {
    final fileIdx = square.codeUnitAt(0) - 'a'.codeUnitAt(0);
    final rank = int.parse(square[1]);
    return widget.flipped ? (rank - 1, 7 - fileIdx) : (8 - rank, fileIdx);
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
