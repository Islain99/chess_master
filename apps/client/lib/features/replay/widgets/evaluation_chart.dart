// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Graphique d'évaluation (avantage blanc / noir au fil de la partie)
//
// Ordonnée : probabilité de gain des blancs (0–100 %) plutôt que les
// centipions bruts, pour que les positions gagnantes ne « sortent » pas du
// graphique. Zone claire = avantage blanc, zone sombre = avantage noir.
// Points de couleur : imprécisions, erreurs, gaffes (et coups brillants).
// Toucher ou glisser sur le graphique sélectionne un demi-coup.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';

import '../models/eval_point.dart';

class EvaluationChart extends StatelessWidget {
  const EvaluationChart({
    super.key,
    required this.points,
    required this.selectedPly,
    required this.onSelectPly,
    this.height = 120,
  });

  final List<EvalPoint> points;

  /// Demi-coup affiché sur l'échiquier (0 = position initiale).
  final int selectedPly;
  final ValueChanged<int> onSelectPly;
  final double height;

  /// Demi-coups annotés d'un marqueur.
  static const markedClassifications = {'brilliant', 'inaccuracy', 'mistake', 'blunder'};

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) return SizedBox(height: height);

    return Semantics(
      label: 'Graphique d\'évaluation, ${points.length} demi-coups',
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          void select(Offset local) => onSelectPly(plyAtX(local.dx, width, points.length));

          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (d) => select(d.localPosition),
            onHorizontalDragUpdate: (d) => select(d.localPosition),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: CustomPaint(
                size: Size(width, height),
                painter: EvaluationChartPainter(points: points, selectedPly: selectedPly),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Abscisse → demi-coup (0 = départ … n = dernier coup).
  static int plyAtX(double x, double width, int plyCount) {
    if (width <= 0 || plyCount == 0) return 0;
    final ratio = (x / width).clamp(0.0, 1.0);
    return (ratio * plyCount).round();
  }
}

class EvaluationChartPainter extends CustomPainter {
  EvaluationChartPainter({required this.points, required this.selectedPly});

  final List<EvalPoint> points;
  final int selectedPly;

  @override
  void paint(Canvas canvas, Size size) {
    final n = points.length;
    double xOf(int ply) => size.width * ply / n;
    double yOf(double winPct) => size.height * (1 - winPct / 100);

    // Fond = avantage noir
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF2B2B2B));

    // Zone blanche : de la courbe jusqu'en bas (point de départ à 50 %)
    final area = Path()..moveTo(0, size.height)..lineTo(0, yOf(50));
    for (final p in points) {
      area.lineTo(xOf(p.ply), yOf(p.whiteWinPercent));
    }
    area
      ..lineTo(size.width, size.height)
      ..close();
    canvas.drawPath(area, Paint()..color = const Color(0xFFE8E8E8));

    // Ligne d'égalité
    canvas.drawLine(
      Offset(0, yOf(50)),
      Offset(size.width, yOf(50)),
      Paint()
        ..color = const Color(0x55888888)
        ..strokeWidth = 1,
    );

    // Demi-coup sélectionné
    if (selectedPly > 0 && selectedPly <= n) {
      final x = xOf(selectedPly);
      canvas.drawLine(
        Offset(x, 0),
        Offset(x, size.height),
        Paint()
          ..color = const Color(0xFFE94560)
          ..strokeWidth = 2,
      );
    }

    // Marqueurs
    for (final p in points) {
      if (!EvaluationChart.markedClassifications.contains(p.classification)) continue;
      final style = classificationStyle(p.classification);
      final center = Offset(xOf(p.ply), yOf(p.whiteWinPercent));
      canvas.drawCircle(center, 4.5, Paint()..color = const Color(0xFF1A1A1A));
      canvas.drawCircle(center, 3.5, Paint()..color = Color(style.color));
    }
  }

  @override
  bool shouldRepaint(EvaluationChartPainter old) =>
      old.selectedPly != selectedPly || !identical(old.points, points);
}
