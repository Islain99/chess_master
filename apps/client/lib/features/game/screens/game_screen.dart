import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../board/widgets/chess_board.dart';
import '../../board/widgets/chess_piece.dart';
import '../models/game_state.dart';
import '../providers/game_provider.dart';

/// Écran principal d'une partie d'échecs.
/// Affiche : info adversaire, plateau, info joueur, historique des coups.
class GameScreen extends ConsumerStatefulWidget {
  const GameScreen({super.key});

  @override
  ConsumerState<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends ConsumerState<GameScreen> {
  @override
  Widget build(BuildContext context) {
    final asyncState = ref.watch(gameProvider);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Échecs'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flip),
            tooltip: 'Retourner le plateau',
            onPressed: () => ref.read(gameProvider.notifier).flipBoard(),
          ),
        ],
      ),
      body: asyncState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('Erreur : $e', style: const TextStyle(color: Colors.red)),
        ),
        data: (state) => _buildGameView(context, state),
      ),
    );
  }

  Widget _buildGameView(BuildContext context, GameState state) {
    // Afficher le sélecteur de promotion si en attente
    if (state.pendingPromotion != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (_) => PromotionDialog(
            color: state.position.activeColor == 'w' ? 'w' : 'b',
            onSelect: ref.read(gameProvider.notifier).confirmPromotion,
          ),
        );
      });
    }

    // Afficher une erreur temporaire
    if (state.error != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(state.error!),
            backgroundColor: AppTheme.accent,
            duration: const Duration(seconds: 2),
          ),
        );
        ref.read(gameProvider.notifier); // Le notifier efface l'erreur
      });
    }

    // Afficher le résultat
    if (state.isOver) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showResultDialog(context, state);
      });
    }

    final notifier = ref.read(gameProvider.notifier);
    final flipped  = state.isFlipped;

    // Trouver le roi en échec
    final inCheckSquare = _findKingInCheck(state);

    return SafeArea(
      child: Column(
        children: [
          // ─── Info joueur du haut ────────────────────────────────────────
          _PlayerInfoBar(
            label: flipped ? 'Blancs' : 'Noirs',
            timeMs: flipped ? state.whiteTimeMs : state.blackTimeMs,
            isActive: flipped
                ? state.activeColor == 'w'
                : state.activeColor == 'b',
          ),

          // ─── Plateau ─────────────────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Center(
                child: ChessBoardWidget(
                  position: state.position,
                  selectedSquare: state.selectedSquare,
                  legalTargets: state.legalTargets,
                  lastMove: state.lastMove,
                  inCheckSquare: inCheckSquare,
                  flipped: flipped,
                  onSquareTap: notifier.onSquareTap,
                  onPieceDrop: notifier.onPieceDrop,
                ),
              ),
            ),
          ),

          // ─── Info joueur du bas ─────────────────────────────────────────
          _PlayerInfoBar(
            label: flipped ? 'Noirs' : 'Blancs',
            timeMs: flipped ? state.blackTimeMs : state.whiteTimeMs,
            isActive: flipped
                ? state.activeColor == 'b'
                : state.activeColor == 'w',
          ),

          // ─── Historique des coups ────────────────────────────────────────
          if (state.moves.isNotEmpty) _MoveHistory(moves: state.moves),

          // ─── Boutons d'action ────────────────────────────────────────────
          if (!state.isOver)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.flag, size: 18),
                      label: const Text('Abandonner'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.accent,
                        side: const BorderSide(color: AppTheme.accent),
                      ),
                      onPressed: () => _confirmResign(context, state),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  String? _findKingInCheck(GameState state) {
    // Si le dernier coup a produit un échec, trouver le roi du joueur courant
    if (state.lastMove?.isCheck ?? false) {
      final kingCode = '${state.activeColor}K';
      return state.position.pieces.entries
          .firstWhere(
            (e) => e.value == kingCode,
            orElse: () => const MapEntry('', ''),
          )
          .key;
    }
    return null;
  }

  Future<void> _confirmResign(BuildContext context, GameState state) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Abandonner ?',
            style: TextStyle(color: Colors.white)),
        content: const Text(
          'Votre adversaire remportera la partie.',
          style: TextStyle(color: Colors.white70),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Abandonner'),
          ),
        ],
      ),
    );
    if (confirm == true && mounted) {
      ref.read(gameProvider.notifier).resign(
            state.activeColor == 'w' ? 'white' : 'black',
          );
    }
  }

  void _showResultDialog(BuildContext context, GameState state) {
    if (!mounted) return;
    final msg = _resultMessage(state);
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text(msg, style: const TextStyle(color: Colors.white)),
        content: Text(
          _reasonMessage(state.resultReason),
          style: const TextStyle(color: Colors.white70),
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.pop(context); // revenir à l'accueil
            },
            child: const Text('Accueil'),
          ),
        ],
      ),
    );
  }

  String _resultMessage(GameState state) {
    switch (state.result) {
      case 'WHITE_WIN':
        return '♔ Les Blancs gagnent !';
      case 'BLACK_WIN':
        return '♚ Les Noirs gagnent !';
      case 'DRAW':
        return '½-½ Nulle !';
      default:
        return 'Partie terminée';
    }
  }

  String _reasonMessage(String? reason) {
    switch (reason) {
      case 'CHECKMATE':
        return 'Échec et mat';
      case 'RESIGNATION':
        return 'Abandon';
      case 'STALEMATE':
        return 'Pat';
      case 'THREEFOLD_REPETITION':
        return 'Triple répétition';
      case 'FIFTY_MOVE_RULE':
        return 'Règle des 50 coups';
      case 'INSUFFICIENT_MATERIAL':
        return 'Matériel insuffisant';
      default:
        return '';
    }
  }
}

// ─── Barre d'info joueur ──────────────────────────────────────────────────────

class _PlayerInfoBar extends StatelessWidget {
  const _PlayerInfoBar({
    required this.label,
    required this.timeMs,
    required this.isActive,
  });

  final String label;
  final int timeMs;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final minutes = (timeMs ~/ 60000).toString().padLeft(2, '0');
    final seconds = ((timeMs % 60000) ~/ 1000).toString().padLeft(2, '0');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: isActive
          ? AppTheme.primary.withOpacity(0.3)
          : Colors.transparent,
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: ChessPieceWidget(
                pieceCode: label.contains('Blanc') ? 'wK' : 'bK',
                size: 36,
              ),
            ),
          ),
          const Gap(12),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w500,
                fontSize: 15,
              ),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: isActive ? AppTheme.accent : AppTheme.surface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '$minutes:$seconds',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w600,
                fontSize: 16,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Historique des coups ─────────────────────────────────────────────────────

class _MoveHistory extends StatelessWidget {
  const _MoveHistory({required this.moves});
  final List<dynamic> moves;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 48,
      color: AppTheme.surface,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: (moves.length / 2).ceil(),
        itemBuilder: (context, i) {
          final white = moves[i * 2];
          final black = i * 2 + 1 < moves.length ? moves[i * 2 + 1] : null;
          return Padding(
            padding: const EdgeInsets.only(right: 12),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('${i + 1}.',
                    style: const TextStyle(
                        color: Colors.white38, fontSize: 13)),
                const Gap(4),
                Text(white.san as String,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 13,
                        fontWeight: FontWeight.w500)),
                if (black != null) ...[
                  const Gap(6),
                  Text(black.san as String,
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 13)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
