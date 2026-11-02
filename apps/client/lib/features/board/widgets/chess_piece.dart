import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/settings/settings_provider.dart';

/// Affiche une pièce d'échecs selon le style choisi dans les Paramètres.
///
/// Sprint 18 : le réglage « Pièces » (PieceStyle) était enregistré mais
/// jamais appliqué ; il pilote désormais le rendu sur tous les plateaux.
///
///   • classic : silhouettes pleines, liseré contrasté (lisible sur toutes
///     les couleurs de cases) ;
///   • solid   : version très contrastée (liseré épais) ;
///   • outline : pièces « au trait », style imprimé ;
///   • letters : lettres françaises R D T F C P dans un disque — utile en cas
///     de basse vision ou de police sans glyphes d'échecs.
///
/// Les glyphes Unicode sont suivis du sélecteur U+FE0E (présentation
/// « texte ») : sans lui, Android et iOS affichent ♟ sous forme d'emoji.
class ChessPieceWidget extends ConsumerWidget {
  const ChessPieceWidget({
    super.key,
    required this.pieceCode,
    this.size = 42.0,
    this.style,
  });

  /// Code pièce (ex. "wK", "bP") tel que retourné par [BoardPosition].
  final String pieceCode;
  final double size;

  /// Style imposé (aperçu dans les Paramètres) ; sinon celui des réglages.
  final PieceStyle? style;

  static const _textPresentation = '︎';

  static const Map<String, String> _filled = {
    'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟',
  };
  static const Map<String, String> _outlined = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
  };

  /// Notation française : Roi, Dame, Tour, Fou, Cavalier, Pion.
  static const Map<String, String> _letters = {
    'K': 'R', 'Q': 'D', 'R': 'T', 'B': 'F', 'N': 'C', 'P': 'P',
  };

  static const Map<String, String> _nameFr = {
    'K': 'roi', 'Q': 'dame', 'R': 'tour', 'B': 'fou', 'N': 'cavalier', 'P': 'pion',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (pieceCode.length != 2 || !_filled.containsKey(pieceCode[1])) {
      return const SizedBox.shrink();
    }
    final PieceStyle effective =
        style ?? ref.watch(settingsProvider.select((s) => s.pieceStyle));
    final isWhite = pieceCode[0] == 'w';
    final type = pieceCode[1];

    return Semantics(
      label: '${_nameFr[type]} ${isWhite ? 'blanc' : 'noir'}',
      excludeSemantics: true,
      child: switch (effective) {
        PieceStyle.classic => _glyph(_filled[type]!, isWhite, strokeRatio: 0.035),
        PieceStyle.solid => _glyph(_filled[type]!, isWhite, strokeRatio: 0.07),
        PieceStyle.outline => _outline(_outlined[type]!, isWhite),
        PieceStyle.letters => _letter(_letters[type]!, isWhite),
      },
    );
  }

  /// Silhouette pleine + liseré : deux couches de texte superposées
  /// (un TextStyle ne peut pas combiner `color` et `foreground`).
  Widget _glyph(String glyph, bool isWhite, {required double strokeRatio}) {
    final text = '$glyph$_textPresentation';
    final fontSize = size * 0.74;
    final fill = isWhite ? const Color(0xFFFAFAFA) : const Color(0xFF1E1E1E);
    final stroke = isWhite ? const Color(0xFF1E1E1E) : const Color(0xFFE8E8E8);

    return Stack(
      alignment: Alignment.center,
      children: [
        Text(
          text,
          style: TextStyle(
            fontSize: fontSize,
            height: 1,
            foreground: Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = size * strokeRatio
              ..strokeJoin = StrokeJoin.round
              ..color = stroke,
          ),
        ),
        Text(text, style: TextStyle(fontSize: fontSize, height: 1, color: fill)),
      ],
    );
  }

  /// Pièces au trait, légère ombre pour les détacher des cases.
  Widget _outline(String glyph, bool isWhite) {
    return Text(
      '$glyph$_textPresentation',
      style: TextStyle(
        fontSize: size * 0.74,
        height: 1,
        color: isWhite ? Colors.white : Colors.black,
        shadows: [
          Shadow(color: isWhite ? Colors.black54 : Colors.white60, blurRadius: 2),
          Shadow(color: isWhite ? Colors.black38 : Colors.white38, blurRadius: 4),
        ],
      ),
    );
  }

  /// Lettre dans un disque (aucune dépendance aux glyphes d'échecs de la police).
  Widget _letter(String letter, bool isWhite) {
    final diameter = size * 0.78;
    return Container(
      width: diameter,
      height: diameter,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: isWhite ? const Color(0xFFFAFAFA) : const Color(0xFF1E1E1E),
        border: Border.all(
          color: isWhite ? const Color(0xFF1E1E1E) : const Color(0xFFE8E8E8),
          width: size * 0.04,
        ),
      ),
      child: Text(
        letter,
        style: TextStyle(
          fontSize: diameter * 0.55,
          height: 1,
          fontWeight: FontWeight.w800,
          color: isWhite ? const Color(0xFF1E1E1E) : const Color(0xFFFAFAFA),
        ),
      ),
    );
  }
}
