import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../replay/screens/game_replay_screen.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../board/widgets/chess_board.dart';
import '../../board/widgets/chess_piece.dart';
import '../providers/multiplayer_provider.dart';

/// Écran de partie en ligne.
/// Connecté via WebSocket — les coups sont envoyés via SocketService.
class OnlineGameScreen extends ConsumerStatefulWidget {
  const OnlineGameScreen({super.key});

  @override
  ConsumerState<OnlineGameScreen> createState() => _OnlineGameScreenState();
}

class _OnlineGameScreenState extends ConsumerState<OnlineGameScreen> {
  /// Garde-fous contre l'empilement des boîtes de dialogue (sprint 18).
  String? _resultShownFor;
  bool _drawDialogOpen = false;

  @override
  void dispose() {
    ref.read(multiplayerProvider.notifier).disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final asyncState = ref.watch(multiplayerProvider);

    // Sprint 17 : afficher les refus du serveur (pas votre tour, nulle non
    // proposée…), puis les effacer pour qu'un même refus puisse se réafficher.
    ref.listen(multiplayerProvider, (_, next) {
      final s = next.valueOrNull;
      final message = s?.error ?? s?.board.error;
      if (message == null) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          backgroundColor: Colors.red.shade700,
        ));
      ref.read(multiplayerProvider.notifier).clearErrors();
    });

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('En ligne'),
        actions: [
          IconButton(
            icon: const Icon(Icons.flip),
            onPressed: () => ref.read(multiplayerProvider.notifier).flipBoard(),
          ),
        ],
      ),
      body: asyncState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
            child: Text('Erreur : $e', style: const TextStyle(color: Colors.red))),
        data: (state) => _buildView(context, state),
      ),
    );
  }

  Widget _buildView(BuildContext context, OnlineGameState state) {
    // Fin de partie
    // Sprint 18 : une seule boîte par événement (avant, chaque reconstruction
    // de l'écran en empilait une nouvelle).
    if (state.isOver && _resultShownFor != state.gameId) {
      _resultShownFor = state.gameId;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _showResultDialog(context, state);
      });
    }

    // Offre de nulle reçue
    if (state.drawOffered && !_drawDialogOpen) {
      _drawDialogOpen = true;
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        await _showDrawDialog(context);
        _drawDialogOpen = false;
      });
    }

    // Promotion en attente
    if (state.board.pendingPromotion != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        showDialog<void>(
          context: context,
          barrierDismissible: false,
          builder: (_) => PromotionDialog(
            color: state.playerColor ?? 'w',
            onSelect: ref.read(multiplayerProvider.notifier).confirmPromotion,
          ),
        );
      });
    }

    final notifier = ref.read(multiplayerProvider.notifier);
    final board    = state.board;
    final flipped  = board.isFlipped ||
        (state.playerColor == 'b' && !board.isFlipped);

    // Trouver le roi en échec
    String? inCheckSquare;
    if (board.lastMove?.isCheck ?? false) {
      final kingCode = '${board.activeColor}K';
      inCheckSquare = board.position.pieces.entries
          .firstWhere(
            (e) => e.value == kingCode,
            orElse: () => const MapEntry('', ''),
          )
          .key;
    }

    return SafeArea(
      child: Column(
        children: [
          // ─── Adversaire déconnecté ──────────────────────────────────────
          if (!state.opponentConnected)
            Container(
              color: Colors.orange.withValues(alpha: 0.3),
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 16),
              child: const Row(
                children: [
                  Icon(Icons.wifi_off, color: Colors.orange, size: 16),
                  Gap(8),
                  Text('Adversaire déconnecté — 30 s avant forfait',
                      style: TextStyle(color: Colors.orange, fontSize: 13)),
                ],
              ),
            ),

          // ─── Attente d'adversaire ───────────────────────────────────────
          if (state.isWaiting)
            Container(
              color: AppTheme.primary.withValues(alpha: 0.3),
              padding: const EdgeInsets.all(12),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SizedBox(
                    width: 14, height: 14,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white54)),
                  Gap(10),
                  Text('En attente de l\'adversaire…',
                      style: TextStyle(color: Colors.white60, fontSize: 13)),
                ],
              ),
            ),

          // ─── Joueur du haut ─────────────────────────────────────────────
          _PlayerBar(
            label: flipped ? 'Vous' : 'Adversaire',
            isYou: flipped,
            timeMs: flipped ? board.whiteTimeMs : board.blackTimeMs,
            isActive: flipped
                ? board.activeColor == 'w'
                : board.activeColor == 'b',
            pieceColor: flipped ? 'w' : 'b',
          ),

          // ─── Plateau ─────────────────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 4),
              child: Center(
                child: ChessBoardWidget(
                  position: board.position,
                  selectedSquare: board.selectedSquare,
                  legalTargets: board.legalTargets,
                  lastMove: board.lastMove,
                  inCheckSquare: inCheckSquare,
                  flipped: flipped,
                  onSquareTap: notifier.onSquareTap,
                  onPieceDrop: notifier.onPieceDrop,
                ),
              ),
            ),
          ),

          // ─── Joueur du bas ───────────────────────────────────────────────
          _PlayerBar(
            label: flipped ? 'Adversaire' : 'Vous',
            isYou: !flipped,
            timeMs: flipped ? board.blackTimeMs : board.whiteTimeMs,
            isActive: flipped
                ? board.activeColor == 'b'
                : board.activeColor == 'w',
            pieceColor: flipped ? 'b' : 'w',
          ),

          // ─── Historique ───────────────────────────────────────────────────
          if (board.moves.isNotEmpty) _MoveHistory(moves: board.moves),

          // ─── Actions ──────────────────────────────────────────────────────
          if (!state.isOver && !state.isWaiting)
            _ActionBar(state: state, notifier: notifier),
        ],
      ),
    );
  }

  Future<void> _showResultDialog(BuildContext context, OnlineGameState state) async {
    if (!mounted) return;
    final isWin = (state.result == 'WHITE_WIN' && state.playerColor == 'w') ||
                  (state.result == 'BLACK_WIN' && state.playerColor == 'b');
    final msg = isWin ? '🎉 Vous avez gagné !'
               : state.result == 'DRAW' ? '½-½ Nulle !'
               : '😔 Défaite';

    await showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: Text(msg, style: const TextStyle(color: Colors.white)),
        content: Text(
          _reasonLabel(state.resultReason),
          style: const TextStyle(color: Colors.white70),
        ),
        actions: [
          // Sprint 18 : revoir la partie et l'analyser avec Stockfish
          if (state.gameId != null)
            TextButton.icon(
              icon: const Icon(Icons.insights),
              label: const Text('Revoir et analyser'),
              onPressed: () {
                Navigator.pop(context);
                Navigator.pushReplacement(
                  context,
                  MaterialPageRoute<void>(
                    builder: (_) => GameReplayScreen(gameId: state.gameId!, flipped: state.playerColor == 'b'),
                  ),
                );
              },
            ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              Navigator.pop(context);
            },
            child: const Text('Retour au lobby'),
          ),
        ],
      ),
    );
  }

  Future<void> _showDrawDialog(BuildContext context) async {
    if (!mounted) return;
    final accept = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Offre de nulle', style: TextStyle(color: Colors.white)),
        content: const Text('Votre adversaire propose la nulle. Acceptez-vous ?',
            style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Refuser'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Accepter'),
          ),
        ],
      ),
    );
    if (accept != null) {
      ref.read(multiplayerProvider.notifier).respondToDraw(accept);
    }
  }

  String _reasonLabel(String? r) {
    switch (r) {
      case 'CHECKMATE':             return 'Échec et mat';
      case 'RESIGNATION':           return 'Abandon';
      case 'STALEMATE':             return 'Pat';
      case 'DRAW_AGREEMENT':        return 'Nulle par accord';
      case 'ABANDONED':             return 'Forfait (déconnexion)';
      case 'THREEFOLD_REPETITION':  return 'Triple répétition';
      case 'FIFTY_MOVE_RULE':       return 'Règle des 50 coups';
      case 'INSUFFICIENT_MATERIAL': return 'Matériel insuffisant';
      default:                      return '';
    }
  }
}

// ─── Barre de joueur ─────────────────────────────────────────────────────────

class _PlayerBar extends StatelessWidget {
  const _PlayerBar({
    required this.label,
    required this.isYou,
    required this.timeMs,
    required this.isActive,
    required this.pieceColor,
  });

  final String label;
  final bool   isYou;
  final int    timeMs;
  final bool   isActive;
  final String pieceColor;

  @override
  Widget build(BuildContext context) {
    final minutes = (timeMs ~/ 60000).toString().padLeft(2, '0');
    final seconds = ((timeMs % 60000) ~/ 1000).toString().padLeft(2, '0');
    final isLow   = timeMs > 0 && timeMs < 30000;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: isActive ? AppTheme.primary.withValues(alpha: 0.3) : Colors.transparent,
      child: Row(
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: AppTheme.surface,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Center(
              child: ChessPieceWidget(
                pieceCode: '${pieceColor}K',
                size: 36,
              ),
            ),
          ),
          const Gap(10),
          Expanded(
            child: Text(
              label + (isYou ? ' (vous)' : ''),
              style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: isLow ? AppTheme.accent : (isActive ? AppTheme.accent : AppTheme.surface),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              '$minutes:$seconds',
              style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w600, fontSize: 16,
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

class _ActionBar extends StatelessWidget {
  const _ActionBar({required this.state, required this.notifier});

  final OnlineGameState state;
  final MultiplayerNotifier notifier;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
      child: Row(
        children: [
          const Spacer(),
          OutlinedButton(
            onPressed: () => _confirmDraw(context),
            style: OutlinedButton.styleFrom(
              foregroundColor: Colors.white70,
              side: const BorderSide(color: Colors.white24),
            ),
            child: const Text('½ Nulle'),
          ),
          const Gap(8),
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
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppTheme.surface,
        title: const Text('Proposer la nulle ?',
            style: TextStyle(color: Colors.white)),
        content: const Text('L\'adversaire devra accepter.',
            style: TextStyle(color: Colors.white70)),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler')),
          ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Proposer')),
        ],
      ),
    );
    if (ok == true) notifier.offerDraw();
  }

  Future<void> _confirmResign(BuildContext context) async {
    final ok = await showDialog<bool>(
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
    if (ok == true) notifier.resign();
  }
}

// ─── Historique ───────────────────────────────────────────────────────────────

class _MoveHistory extends StatelessWidget {
  const _MoveHistory({required this.moves});
  final List<dynamic> moves;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 44,
      color: AppTheme.surface,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: (moves.length / 2).ceil(),
        itemBuilder: (ctx, i) {
          final white = moves[i * 2];
          final black = i * 2 + 1 < moves.length ? moves[i * 2 + 1] : null;
          return Padding(
            padding: const EdgeInsets.only(right: 10),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text('${i + 1}.',
                  style: const TextStyle(color: Colors.white38, fontSize: 12)),
              const Gap(4),
              Text(white.san as String,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 12, fontWeight: FontWeight.w500)),
              if (black != null) ...[
                const Gap(5),
                Text(black.san as String,
                    style: const TextStyle(color: Colors.white70, fontSize: 12)),
              ],
            ]),
          );
        },
      ),
    );
  }
}
