import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../board/widgets/chess_board.dart';
import '../../board/widgets/chess_piece.dart';
import '../models/game_state.dart';
import '../providers/game_provider.dart';

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
        title: Text(_appTitle(asyncState.valueOrNull)),
        actions: [
          IconButton(
            icon: const Icon(Icons.flip),
            tooltip: 'Retourner',
            onPressed: () => ref.read(gameProvider.notifier).flipBoard(),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.more_vert),
            onSelected: (v) => _handleMenu(v, asyncState.valueOrNull),
            itemBuilder: (_) => const [
              PopupMenuItem(value: 'export', child: Text('Copier le PGN')),
            ],
          ),
        ],
      ),
      body: asyncState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Center(child: Text('Erreur : $e', style: const TextStyle(color: Colors.red))),
        data: (state) => _buildGameView(context, state),
      ),
    );
  }

  String _appTitle(GameState? state) {
    if (state == null) return 'Échecs';
    if (state.isAiMode) return 'Contre l\'IA — Niveau ${state.aiLevel}';
    return 'Partie locale';
  }

  Widget _buildGameView(BuildContext context, GameState state) {
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

    if (state.error != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(state.error!),
            backgroundColor: AppTheme.accent,
            duration: const Duration(seconds: 2),
          ),
        );
      });
    }

    if (state.isOver) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showResultDialog(context, state);
      });
    }

    final notifier = ref.read(gameProvider.notifier);
    final flipped = state.isFlipped;
    final inCheckSquare = _findKingInCheck(state);

    return SafeArea(
      child: Column(
        children: [
          // ─── Bandeau "IA réfléchit" ──────────────────────────────────────
          if (state.isAiThinking)
            Container(
              color: AppTheme.primary.withValues(alpha: 0.4),
              padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 14,
                    height: 14,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white70,
                    ),
                  ),
                  Gap(10),
                  Text(
                    'L\'IA réfléchit…',
                    style: TextStyle(color: Colors.white70, fontSize: 13),
                  ),
                ],
              ),
            ),

          // ─── Joueur du haut ─────────────────────────────────────────────
          _PlayerInfoBar(
            label: flipped ? 'Blancs' : 'Noirs',
            sublabel: flipped
                ? null
                : (state.isAiMode ? 'IA niv. ${state.aiLevel}' : null),
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

          // ─── Joueur du bas ───────────────────────────────────────────────
          _PlayerInfoBar(
            label: flipped ? 'Noirs' : 'Blancs',
            sublabel: flipped
                ? (state.isAiMode ? 'IA niv. ${state.aiLevel}' : null)
                : null,
            timeMs: flipped ? state.blackTimeMs : state.whiteTimeMs,
            isActive: flipped
                ? state.activeColor == 'b'
                : state.activeColor == 'w',
          ),

          // ─── Historique ──────────────────────────────────────────────────
          if (state.moves.isNotEmpty) _MoveHistory(moves: state.moves),

          // ─── Actions ─────────────────────────────────────────────────────
          if (!state.isOver && !state.isAiThinking)
            _ActionBar(state: state, notifier: notifier),
        ],
      ),
    );
  }

  Future<void> _handleMenu(String action, GameState? state) async {
    if (action == 'export') {
      await ref.read(gameProvider.notifier).exportPgn();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('PGN copié dans le presse-papier'),
            duration: Duration(seconds: 2),
          ),
        );
      }
    }
  }

  String? _findKingInCheck(GameState state) {
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

  Future<void> _showResultDialog(BuildContext context, GameState state) async {
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text(_resultMessage(state),
            style: const TextStyle(color: Colors.white)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_reasonMessage(state.resultReason),
                style: const TextStyle(color: Colors.white70)),
            const Gap(16),
            ElevatedButton.icon(
              icon: const Icon(Icons.copy, size: 16),
              label: const Text('Copier PGN'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppTheme.primary,
                foregroundColor: Colors.white,
              ),
              onPressed: () async {
                await ref.read(gameProvider.notifier).exportPgn();
                if (context.mounted) {
                  ScaffoldMessenger.of(context)
                      .showSnackBar(const SnackBar(content: Text('PGN copié')));
                }
              },
            ),
          ],
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.pop(context);
            },
            child: const Text('Accueil'),
          ),
        ],
      ),
    );
  }

  String _resultMessage(GameState s) {
    switch (s.result) {
      case 'WHITE_WIN': return '♔ Les Blancs gagnent !';
      case 'BLACK_WIN': return '♚ Les Noirs gagnent !';
      case 'DRAW':      return '½-½ Nulle !';
      default:          return 'Partie terminée';
    }
  }

  String _reasonMessage(String? r) {
    switch (r) {
      case 'CHECKMATE':             return 'Échec et mat';
      case 'RESIGNATION':           return 'Abandon';
      case 'STALEMATE':             return 'Pat';
      case 'DRAW_AGREEMENT':        return 'Nulle par accord';
      case 'THREEFOLD_REPETITION':  return 'Triple répétition';
      case 'FIFTY_MOVE_RULE':       return 'Règle des 50 coups';
      case 'INSUFFICIENT_MATERIAL': return 'Matériel insuffisant';
      default:                      return '';
    }
  }
}

// ─── Barre de joueur ─────────────────────────────────────────────────────────

class _PlayerInfoBar extends StatelessWidget {
  const _PlayerInfoBar({
    required this.label,
    required this.timeMs,
    required this.isActive,
    this.sublabel,
  });

  final String label;
  final String? sublabel;
  final int timeMs;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final minutes = (timeMs ~/ 60000).toString().padLeft(2, '0');
    final seconds = ((timeMs % 60000) ~/ 1000).toString().padLeft(2, '0');
    final isLow = timeMs > 0 && timeMs < 30000;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: isActive ? AppTheme.primary.withValues(alpha: 0.3) : Colors.transparent,
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w500,
                      fontSize: 15,
                    )),
                if (sublabel != null)
                  Text(sublabel!,
                      style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.45),
                        fontSize: 11,
                      )),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: isLow
                  ? AppTheme.accent
                  : (isActive ? AppTheme.accent : AppTheme.surface),
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

// ─── Barre d'actions ─────────────────────────────────────────────────────────

class _ActionBar extends ConsumerWidget {
  const _ActionBar({required this.state, required this.notifier});

  final GameState state;
  final GameNotifier notifier;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final canUndo = state.moves.isNotEmpty &&
        !state.isAiMode; // annulation désactivée en mode IA

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          if (canUndo)
            IconButton(
              onPressed: () => notifier.undoMove(),
              icon: const Icon(Icons.undo, color: Colors.white70),
              tooltip: 'Annuler',
            ),
          const Spacer(),
          if (!state.isAiMode)
            OutlinedButton(
              onPressed: () => _confirmDraw(context),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white70,
                side: const BorderSide(color: Colors.white24),
              ),
              child: const Text('½ Nulle'),
            ),
          if (!state.isAiMode) const Gap(8),
          OutlinedButton.icon(
            icon: const Icon(Icons.flag, size: 16),
            label: const Text('Abandon'),
            style: OutlinedButton.styleFrom(
              foregroundColor: AppTheme.accent,
              side: const BorderSide(color: AppTheme.accent),
            ),
            onPressed: () => _confirmResign(context),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmDraw(BuildContext context) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Proposer la nulle ?',
            style: TextStyle(color: Colors.white)),
        content: const Text('Les deux joueurs acceptent-ils la nulle ?',
            style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Accepter')),
        ],
      ),
    );
    if (confirm == true) notifier.acceptDraw();
  }

  Future<void> _confirmResign(BuildContext context) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Abandonner ?',
            style: TextStyle(color: Colors.white)),
        content: const Text('Votre adversaire remportera la partie.',
            style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Abandonner')),
        ],
      ),
    );
    if (confirm == true) {
      notifier.resign(state.activeColor == 'w' ? 'white' : 'black');
    }
  }
}

// ─── Historique ──────────────────────────────────────────────────────────────

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
                    style:
                        const TextStyle(color: Colors.white38, fontSize: 13)),
                const Gap(4),
                Text(white.san as String,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 13,
                        fontWeight: FontWeight.w500)),
                if (black != null) ...[
                  const Gap(6),
                  Text(black.san as String,
                      style:
                          const TextStyle(color: Colors.white70, fontSize: 13)),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
