// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Points du graphique d'évaluation
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:math' as math;

/// Évaluation après un demi-coup, toujours du point de vue des BLANCS.
class EvalPoint {
  const EvalPoint({
    required this.ply,
    required this.whiteCp,
    required this.classification,
    this.san,
  });

  final int ply;

  /// Centipions, positif = avantage blanc (±10 000 = mat).
  final int whiteCp;

  /// brilliant, best, good, inaccuracy, mistake, blunder…
  final String classification;
  final String? san;

  /// Probabilité de gain des blancs (0–100), utilisée comme ordonnée.
  double get whiteWinPercent => winPercent(whiteCp);
}

/// Conversion centipions → probabilité de gain (formule de Lichess).
/// L'échelle logistique écrase les grands écarts : +900 et +1500 sont tous
/// deux « gagnant », et un mat (±10 000) atteint 0 ou 100.
double winPercent(int cp) {
  final clamped = cp.clamp(-10000, 10000);
  return 50 + 50 * (2 / (1 + math.exp(-0.00368208 * clamped)) - 1);
}

/// Construit les points depuis la réponse GET /games/:id/analysis.
///
/// `evalWhiteCp` (ajouté au sprint 18) est utilisé s'il existe. Pour les
/// analyses plus anciennes, l'évaluation `evalCp` (point de vue du joueur qui
/// vient de jouer) est convertie d'après `player`, sinon d'après la parité du
/// demi-coup et le camp au trait au départ (`whiteStarts`).
List<EvalPoint> evalPointsFrom(
  List<Map<String, dynamic>> evaluations, {
  bool whiteStarts = true,
}) {
  final points = <EvalPoint>[];
  for (final e in evaluations) {
    final ply = (e['ply'] as num?)?.toInt();
    if (ply == null) continue;

    final explicit = (e['evalWhiteCp'] as num?)?.toInt();
    int whiteCp;
    if (explicit != null) {
      whiteCp = explicit;
    } else {
      final moverCp = (e['evalCp'] as num?)?.toInt() ?? 0;
      final player = e['player'] as String?;
      final whiteMoved = player != null ? player == 'WHITE' : (ply.isOdd == whiteStarts);
      whiteCp = whiteMoved ? moverCp : -moverCp;
    }

    points.add(EvalPoint(
      ply: ply,
      whiteCp: whiteCp,
      classification: e['classification'] as String? ?? 'good',
      san: e['san'] as String?,
    ));
  }
  points.sort((a, b) => a.ply.compareTo(b.ply));
  return points;
}

/// Libellé et couleur d'une classification (partagés par le graphique et la liste).
({String label, int color}) classificationStyle(String classification) {
  return switch (classification) {
    'brilliant' => (label: 'Brillant !!', color: 0xFF26C2A3),
    'great' => (label: 'Excellent !', color: 0xFF5C8BB0),
    'best' => (label: 'Meilleur coup', color: 0xFF81B64C),
    'excellent' => (label: 'Excellent', color: 0xFF81B64C),
    'good' => (label: 'Bon', color: 0xFF95B776),
    'book' => (label: 'Théorie', color: 0xFFA88865),
    'inaccuracy' => (label: 'Imprécision ?!', color: 0xFFF7C631),
    'mistake' => (label: 'Erreur ?', color: 0xFFE58F2A),
    'blunder' => (label: 'Gaffe ??', color: 0xFFCA3431),
    _ => (label: classification, color: 0xFF9E9E9E),
  };
}

/// Évaluation lisible : « +1.3 », « −0.4 », « M » pour un mat.
String formatEval(int whiteCp) {
  if (whiteCp.abs() >= 9000) return whiteCp > 0 ? '+M' : '−M';
  final pawns = (whiteCp / 100).toStringAsFixed(1);
  return whiteCp > 0 ? '+$pawns' : (whiteCp < 0 ? '−${pawns.substring(1)}' : '0.0');
}
