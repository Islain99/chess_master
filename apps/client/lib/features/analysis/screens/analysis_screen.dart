import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/analysis_provider.dart';

/// Écran d'analyse post-partie.
/// Affiche : précision, graphique d'évaluation, classification coup par coup.
class AnalysisScreen extends ConsumerWidget {
  const AnalysisScreen({super.key, required this.gameId});

  final String gameId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final analysis = ref.watch(analysisProvider(gameId));

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Analyse Stockfish')),
      body: switch (analysis.status) {
        AnalysisStatus.idle       => _buildRequest(context, ref, analysis),
        AnalysisStatus.requesting  => _buildLoading('Soumission du job…'),
        AnalysisStatus.processing  => _buildProgress(analysis),
        AnalysisStatus.done        => _buildResults(analysis),
        AnalysisStatus.error       => _buildError(analysis.error),
      },
    );
  }

  // ─── Demander l'analyse ───────────────────────────────────────────────────

  Widget _buildRequest(BuildContext ctx, WidgetRef ref, AnalysisState s) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('🔍',
                style: TextStyle(fontSize: 56), textAlign: TextAlign.center),
            const Gap(20),
            const Text('Analyser la partie',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600)),
            const Gap(12),
            Text(
              'Stockfish analysera chaque coup à profondeur 15.\n'
              'L\'analyse prend environ 1-2 minutes.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: Colors.white.withOpacity(0.5), fontSize: 14),
            ),
            const Gap(32),
            ElevatedButton.icon(
              icon: const Icon(Icons.analytics_outlined),
              label: const Text('Lancer l\'analyse'),
              onPressed: () =>
                  ref.read(analysisProvider(gameId).notifier).requestAnalysis(),
            ),
          ],
        ),
      ),
    );
  }

  // ─── En cours ─────────────────────────────────────────────────────────────

  Widget _buildLoading(String msg) => Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(color: AppTheme.accent),
            const Gap(20),
            Text(msg, style: const TextStyle(color: Colors.white70)),
          ],
        ),
      );

  Widget _buildProgress(AnalysisState s) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('⚙️',
                style: TextStyle(fontSize: 48), textAlign: TextAlign.center),
            const Gap(20),
            Text('Analyse en cours… ${s.progress}%',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.w600)),
            const Gap(16),
            LinearProgressIndicator(
              value: s.progress / 100,
              backgroundColor: AppTheme.surface,
              color: AppTheme.accent,
            ),
            const Gap(12),
            Text(
              'Stockfish évalue chaque position à profondeur 15.',
              style:
                  TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Résultats ────────────────────────────────────────────────────────────

  Widget _buildResults(AnalysisState s) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ─── Précision ──────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                  child: _AccuracyCard(
                      label: 'Blancs ♔',
                      accuracy: s.accuracyWhite ?? 0,
                      color: Colors.white)),
              const Gap(12),
              Expanded(
                  child: _AccuracyCard(
                      label: 'Noirs ♚',
                      accuracy: s.accuracyBlack ?? 0,
                      color: Colors.black54)),
            ],
          ),

          const Gap(16),
          Text(
            'Profondeur moteur : ${s.engineDepth ?? 15}',
            style: TextStyle(
                color: Colors.white.withOpacity(0.35), fontSize: 11),
          ),

          const Gap(24),

          // ─── Liste des coups classifiés ─────────────────────────────────
          const Text('Coup par coup',
              style: TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w500)),
          const Gap(12),

          ...s.evaluations.map((e) => _MoveAnalysisRow(eval: e)),
        ],
      ),
    );
  }

  Widget _buildError(String? err) => Center(
        child: Text('Erreur : ${err ?? "inconnue"}',
            style: const TextStyle(color: AppTheme.accent)),
      );
}

// ─── Carte de précision ───────────────────────────────────────────────────────

class _AccuracyCard extends StatelessWidget {
  const _AccuracyCard({
    required this.label,
    required this.accuracy,
    required this.color,
  });
  final String label;
  final double accuracy;
  final Color  color;

  Color _accuracyColor(double a) {
    if (a >= 95) return const Color(0xFF4CAF50);
    if (a >= 85) return const Color(0xFF8BC34A);
    if (a >= 70) return const Color(0xFFFFC107);
    if (a >= 50) return const Color(0xFFFF9800);
    return const Color(0xFFF44336);
  }

  @override
  Widget build(BuildContext context) {
    final c = _accuracyColor(accuracy);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: c.withOpacity(0.4)),
      ),
      child: Column(
        children: [
          Text(label,
              style: const TextStyle(color: Colors.white70, fontSize: 13)),
          const Gap(6),
          Text('${accuracy.toStringAsFixed(1)}%',
              style: TextStyle(
                  color: c, fontSize: 28, fontWeight: FontWeight.w700)),
          const Gap(4),
          LinearProgressIndicator(
            value: accuracy / 100,
            backgroundColor: AppTheme.primary,
            color: c,
          ),
        ],
      ),
    );
  }
}

// ─── Ligne d'analyse d'un coup ────────────────────────────────────────────────

class _MoveAnalysisRow extends StatelessWidget {
  const _MoveAnalysisRow({required this.eval});
  final Map<String, dynamic> eval;

  static const _classColor = {
    'book':       Color(0xFF9E9E9E),
    'brilliant':  Color(0xFF00BCD4),
    'best':       Color(0xFF4CAF50),
    'good':       Color(0xFF8BC34A),
    'inaccuracy': Color(0xFFFFC107),
    'mistake':    Color(0xFFFF9800),
    'blunder':    Color(0xFFF44336),
  };

  static const _classIcon = {
    'book':       '📖',
    'brilliant':  '💎',
    'best':       '✅',
    'good':       '👍',
    'inaccuracy': '⚠️',
    'mistake':    '❌',
    'blunder':    '💥',
  };

  @override
  Widget build(BuildContext context) {
    final ply   = eval['ply']   as int? ?? 0;
    final san   = eval['san']   as String? ?? '?';
    final cls   = eval['classification'] as String? ?? 'good';
    final loss  = eval['evalLoss'] as num? ?? 0;
    final evalCp = eval['evalCp'] as num? ?? 0;

    final color = _classColor[cls] ?? Colors.white70;
    final icon  = _classIcon[cls]  ?? '?';
    final moveNum = (ply / 2).ceil();
    final isWhite = ply % 2 == 1;

    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          SizedBox(
            width: 36,
            child: Text(
              '${moveNum}${isWhite ? '.' : '…'}',
              style: TextStyle(
                  color: Colors.white.withOpacity(0.35), fontSize: 12),
            ),
          ),
          SizedBox(
            width: 60,
            child: Text(san,
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: 14)),
          ),
          const Spacer(),
          Text('$icon ',
              style: const TextStyle(fontSize: 14)),
          Text(cls,
              style: TextStyle(
                  color: color,
                  fontSize: 12,
                  fontWeight: FontWeight.w500)),
          const Spacer(),
          if (loss > 0)
            Text('−${loss.toInt()}cp',
                style: TextStyle(
                    color: Colors.white.withOpacity(0.35), fontSize: 11)),
          const Gap(8),
          SizedBox(
            width: 50,
            child: Text(
              evalCp >= 0
                  ? '+${(evalCp / 100).toStringAsFixed(2)}'
                  : (evalCp / 100).toStringAsFixed(2),
              textAlign: TextAlign.right,
              style: TextStyle(
                  color: evalCp >= 0 ? Colors.white54 : AppTheme.accent,
                  fontSize: 11),
            ),
          ),
        ],
      ),
    );
  }
}
