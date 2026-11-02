// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Revoir une partie terminée (et l'analyser)
//
//   • navigation : début / précédent / lecture automatique / suivant / fin,
//     flèches du clavier (←, →, Début, Fin), toucher un coup de la liste ;
//   • analyse Stockfish : demande, progression, puis graphique d'évaluation
//     interactif, précision des deux camps et qualité de chaque coup.
//
// Remplace l'ancien AnalysisScreen, qui n'était accessible depuis aucun écran.
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';

import '../../../core/theme/app_theme.dart';
import '../../analysis/providers/analysis_provider.dart';
import '../../auth/providers/auth_provider.dart';
import '../../board/models/board_position.dart';
import '../../board/widgets/chess_board.dart';
import '../models/eval_point.dart';
import '../models/replay_game.dart';
import '../widgets/evaluation_chart.dart';

/// Chargement de la partie (une requête par identifiant, mise en cache).
final replayGameProvider = FutureProvider.autoDispose.family<ReplayGame, String>((ref, id) async {
  final data = await ref.watch(apiClientProvider).getGame(id);
  return ReplayGame.fromJson(data);
});

class GameReplayScreen extends ConsumerStatefulWidget {
  const GameReplayScreen({super.key, required this.gameId, this.flipped = false});

  final String gameId;

  /// Orientation initiale (vrai si le joueur avait les noirs).
  final bool flipped;

  @override
  ConsumerState<GameReplayScreen> createState() => _GameReplayScreenState();
}

class _GameReplayScreenState extends ConsumerState<GameReplayScreen> {
  int? _ply; // null = pas encore positionné (fin de partie par défaut)
  late bool _flipped = widget.flipped;
  Timer? _autoplay;

  static const _autoplayStep = Duration(milliseconds: 900);

  @override
  void dispose() {
    _autoplay?.cancel();
    super.dispose();
  }

  void _goTo(ReplayGame game, int ply) {
    setState(() => _ply = game.clampPly(ply));
    if (_ply == game.plyCount) _stopAutoplay();
  }

  void _toggleAutoplay(ReplayGame game) {
    if (_autoplay != null) return _stopAutoplay();
    if ((_ply ?? game.plyCount) >= game.plyCount) _goTo(game, 0);
    setState(() {
      _autoplay = Timer.periodic(_autoplayStep, (_) => _goTo(game, (_ply ?? 0) + 1));
    });
  }

  void _stopAutoplay() {
    _autoplay?.cancel();
    if (mounted) setState(() => _autoplay = null);
  }

  @override
  Widget build(BuildContext context) {
    final asyncGame = ref.watch(replayGameProvider(widget.gameId));

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Revoir la partie'),
        actions: [
          IconButton(
            tooltip: 'Retourner l\'échiquier',
            icon: const Icon(Icons.flip),
            onPressed: () => setState(() => _flipped = !_flipped),
          ),
        ],
      ),
      body: asyncGame.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(
          message: 'Impossible de charger la partie.',
          onRetry: () => ref.invalidate(replayGameProvider(widget.gameId)),
        ),
        data: (game) => _buildContent(context, game),
      ),
    );
  }

  Widget _buildContent(BuildContext context, ReplayGame game) {
    final ply = _ply ?? game.plyCount;
    final analysis = ref.watch(analysisProvider(game.id));
    final points = analysis.isDone
        ? evalPointsFrom(analysis.evaluations, whiteStarts: game.whiteStarts)
        : const <EvalPoint>[];
    final current = points.where((p) => p.ply == ply).firstOrNull;

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.arrowLeft): () => _goTo(game, ply - 1),
        const SingleActivator(LogicalKeyboardKey.arrowRight): () => _goTo(game, ply + 1),
        const SingleActivator(LogicalKeyboardKey.home): () => _goTo(game, 0),
        const SingleActivator(LogicalKeyboardKey.end): () => _goTo(game, game.plyCount),
      },
      child: Focus(
        autofocus: true,
        child: LayoutBuilder(builder: (context, constraints) {
          // Écran large (tablette, desktop, web) : échiquier à gauche, panneau à droite.
          final wide = constraints.maxWidth >= 900;
          final board = ChessBoardWidget(
            position: BoardPosition.fromFen(game.fenAt(ply)),
            onSquareTap: (_) {},
            onPieceDrop: (_, __) {},
            lastMove: game.moveAt(ply),
            flipped: _flipped,
          );
          final panel = _Panel(
            game: game,
            ply: ply,
            current: current,
            points: points,
            analysis: analysis,
            playing: _autoplay != null,
            onGoTo: (p) => _goTo(game, p),
            onToggleAutoplay: () => _toggleAutoplay(game),
            onRequestAnalysis: () => ref.read(analysisProvider(game.id).notifier).requestAnalysis(),
          );

          if (wide) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 5, child: Padding(padding: const EdgeInsets.all(16), child: board)),
                Expanded(flex: 4, child: SingleChildScrollView(padding: const EdgeInsets.all(16), child: panel)),
              ],
            );
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(12),
            child: Column(children: [board, const Gap(12), panel]),
          );
        }),
      ),
    );
  }
}

// ─── Panneau : commandes, coup courant, analyse, liste des coups ─────────────

class _Panel extends StatelessWidget {
  const _Panel({
    required this.game,
    required this.ply,
    required this.current,
    required this.points,
    required this.analysis,
    required this.playing,
    required this.onGoTo,
    required this.onToggleAutoplay,
    required this.onRequestAnalysis,
  });

  final ReplayGame game;
  final int ply;
  final EvalPoint? current;
  final List<EvalPoint> points;
  final AnalysisState analysis;
  final bool playing;
  final ValueChanged<int> onGoTo;
  final VoidCallback onToggleAutoplay;
  final VoidCallback onRequestAnalysis;

  @override
  Widget build(BuildContext context) {
    final move = game.moveAt(ply);
    final classification = current != null ? classificationStyle(current!.classification) : null;
    final byPly = {for (final p in points) p.ply: p};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // ─── Commandes ─────────────────────────────────────────────────────
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _NavButton(icon: Icons.first_page, tooltip: 'Début', onPressed: ply > 0 ? () => onGoTo(0) : null),
            _NavButton(icon: Icons.chevron_left, tooltip: 'Coup précédent', onPressed: ply > 0 ? () => onGoTo(ply - 1) : null),
            _NavButton(
              icon: playing ? Icons.pause : Icons.play_arrow,
              tooltip: playing ? 'Pause' : 'Lecture automatique',
              onPressed: game.plyCount > 0 ? onToggleAutoplay : null,
            ),
            _NavButton(icon: Icons.chevron_right, tooltip: 'Coup suivant', onPressed: ply < game.plyCount ? () => onGoTo(ply + 1) : null),
            _NavButton(icon: Icons.last_page, tooltip: 'Fin', onPressed: ply < game.plyCount ? () => onGoTo(game.plyCount) : null),
          ],
        ),
        const Gap(8),

        // ─── Coup affiché ──────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(10)),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  move == null
                      ? 'Position de départ'
                      : '${game.moveNumberLabel(ply)} ${move.san}',
                  style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
                ),
              ),
              if (classification != null)
                Text(classification.label,
                    style: TextStyle(color: Color(classification.color), fontWeight: FontWeight.w700)),
              if (current != null) ...[
                const Gap(10),
                Text(formatEval(current!.whiteCp),
                    style: const TextStyle(color: Colors.white70, fontFeatures: [FontFeature.tabularFigures()])),
              ],
            ],
          ),
        ),
        const Gap(12),

        // ─── Analyse ───────────────────────────────────────────────────────
        _AnalysisSection(
          game: game,
          ply: ply,
          points: points,
          analysis: analysis,
          onGoTo: onGoTo,
          onRequest: onRequestAnalysis,
        ),
        const Gap(12),

        // ─── Liste des coups ───────────────────────────────────────────────
        Wrap(
          spacing: 4,
          runSpacing: 4,
          children: [
            for (var i = 1; i <= game.plyCount; i++)
              _MoveChip(
                label: '${game.moveNumberLabel(i)} ${game.moves[i - 1].san}',
                selected: i == ply,
                markColor: byPly[i] != null &&
                        EvaluationChart.markedClassifications.contains(byPly[i]!.classification)
                    ? Color(classificationStyle(byPly[i]!.classification).color)
                    : null,
                onTap: () => onGoTo(i),
              ),
          ],
        ),
        if (game.result != null) ...[
          const Gap(12),
          Text(
            _resultLabel(game.result!),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.w600),
          ),
        ],
      ],
    );
  }

  static String _resultLabel(String result) => switch (result) {
        'WHITE_WIN' => '1-0 · victoire des blancs',
        'BLACK_WIN' => '0-1 · victoire des noirs',
        'DRAW' => '½-½ · partie nulle',
        _ => 'Partie interrompue',
      };
}

class _AnalysisSection extends StatelessWidget {
  const _AnalysisSection({
    required this.game,
    required this.ply,
    required this.points,
    required this.analysis,
    required this.onGoTo,
    required this.onRequest,
  });

  final ReplayGame game;
  final int ply;
  final List<EvalPoint> points;
  final AnalysisState analysis;
  final ValueChanged<int> onGoTo;
  final VoidCallback onRequest;

  @override
  Widget build(BuildContext context) {
    if (!game.isFinished) {
      return const _Hint('L\'analyse sera disponible à la fin de la partie.');
    }
    if (game.plyCount == 0) {
      return const _Hint('Aucun coup à analyser.');
    }

    switch (analysis.status) {
      case AnalysisStatus.done:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            EvaluationChart(points: points, selectedPly: ply, onSelectPly: onGoTo),
            const Gap(8),
            Row(
              children: [
                _Accuracy(label: 'Précision blancs', value: analysis.accuracyWhite),
                const Gap(8),
                _Accuracy(label: 'Précision noirs', value: analysis.accuracyBlack),
              ],
            ),
          ],
        );
      case AnalysisStatus.requesting:
      case AnalysisStatus.processing:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Analyse Stockfish en cours… ${analysis.progress} %',
                style: const TextStyle(color: Colors.white70)),
            const Gap(6),
            LinearProgressIndicator(
              value: analysis.progress > 0 ? analysis.progress / 100 : null,
              color: AppTheme.accent,
            ),
          ],
        );
      case AnalysisStatus.error:
      case AnalysisStatus.idle:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (analysis.status == AnalysisStatus.error)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(analysis.error ?? 'L\'analyse a échoué.',
                    style: const TextStyle(color: AppTheme.accent)),
              ),
            OutlinedButton.icon(
              icon: const Icon(Icons.insights),
              label: const Text('Analyser avec Stockfish'),
              onPressed: onRequest,
            ),
          ],
        );
    }
  }
}

class _Accuracy extends StatelessWidget {
  const _Accuracy({required this.label, required this.value});
  final String label;
  final double? value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(8)),
          child: Column(children: [
            Text(value == null ? '—' : '${value!.toStringAsFixed(1)} %',
                style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
            Text(label, style: const TextStyle(color: Colors.white54, fontSize: 12)),
          ]),
        ),
      );
}

class _MoveChip extends StatelessWidget {
  const _MoveChip({required this.label, required this.selected, required this.onTap, this.markColor});
  final String label;
  final bool selected;
  final Color? markColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: selected ? AppTheme.accent : AppTheme.surface,
            borderRadius: BorderRadius.circular(6),
            border: markColor != null ? Border.all(color: markColor!, width: 1.5) : null,
          ),
          child: Text(label, style: const TextStyle(color: Colors.white, fontSize: 13)),
        ),
      );
}

class _NavButton extends StatelessWidget {
  const _NavButton({required this.icon, required this.tooltip, required this.onPressed});
  final IconData icon;
  final String tooltip;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => IconButton(
        icon: Icon(icon, size: 30),
        tooltip: tooltip,
        color: Colors.white,
        disabledColor: Colors.white24,
        onPressed: onPressed,
      );
}

class _Hint extends StatelessWidget {
  const _Hint(this.text);
  final String text;

  @override
  Widget build(BuildContext context) =>
      Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white54));
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(message, style: const TextStyle(color: Colors.white70)),
          const Gap(12),
          OutlinedButton(onPressed: onRetry, child: const Text('Réessayer')),
        ]),
      );
}
