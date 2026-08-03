import 'package:flutter/material.dart';

/// Définit un thème de plateau — couleurs des cases, surbrillances et nom.
class BoardTheme {
  const BoardTheme({
    required this.id,
    required this.name,
    required this.lightSquare,
    required this.darkSquare,
    this.lastMove   = const Color(0xA0CDD26A),
    this.selected   = const Color(0xFF7FC97F),
    this.legalDot  = const Color(0x4C000000),
    this.inCheck    = const Color(0xCCFF3B30),
  });

  final String id;
  final String name;
  final Color  lightSquare;
  final Color  darkSquare;
  final Color  lastMove;
  final Color  selected;
  final Color  legalDot;
  final Color  inCheck;

  // ─── 6 thèmes disponibles ──────────────────────────────────────────────────

  static const classicBrown = BoardTheme(
    id: 'classic', name: 'Classique',
    lightSquare: Color(0xFFF0D9B5),
    darkSquare:  Color(0xFFB58863),
  );

  static const tournament = BoardTheme(
    id: 'tournament', name: 'Tournoi',
    lightSquare: Color(0xFFEEEED2),
    darkSquare:  Color(0xFF769656),
    lastMove:    Color(0xA0BACA44),
    selected:    Color(0xFFF6F669),
  );

  static const ocean = BoardTheme(
    id: 'ocean', name: 'Océan',
    lightSquare: Color(0xFFDAE9EF),
    darkSquare:  Color(0xFF3D6B8A),
    lastMove:    Color(0xA05C9ECA),
    selected:    Color(0xFF5CBFCE),
    legalDot:    Color(0x60FFFFFF),
  );

  static const midnight = BoardTheme(
    id: 'midnight', name: 'Minuit',
    lightSquare: Color(0xFF4B5273),
    darkSquare:  Color(0xFF1D2137),
    lastMove:    Color(0x906B7FBE),
    selected:    Color(0xFF5D6FAE),
    legalDot:    Color(0x60FFFFFF),
  );

  static const emerald = BoardTheme(
    id: 'emerald', name: 'Émeraude',
    lightSquare: Color(0xFFE8F5E9),
    darkSquare:  Color(0xFF2E7D32),
    lastMove:    Color(0xA0AED581),
    selected:    Color(0xFF66BB6A),
  );

  static const coral = BoardTheme(
    id: 'coral', name: 'Corail',
    lightSquare: Color(0xFFFFF3EF),
    darkSquare:  Color(0xFFB23A48),
    lastMove:    Color(0xA0FF8A65),
    selected:    Color(0xFFFF7043),
    legalDot:    Color(0x60FFFFFF),
  );

  static const all = [classicBrown, tournament, ocean, midnight, emerald, coral];

  static BoardTheme byId(String id) =>
      all.firstWhere((t) => t.id == id, orElse: () => classicBrown);
}
