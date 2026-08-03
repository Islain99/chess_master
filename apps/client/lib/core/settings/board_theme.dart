import 'package:flutter/material.dart';

/// Thème visuel du plateau d'échecs.
class BoardTheme {
  const BoardTheme({
    required this.name,
    required this.emoji,
    required this.lightSquare,
    required this.darkSquare,
    required this.selectedSquare,
    required this.lastMove,
    required this.legalDot,
    required this.inCheck,
  });

  final String name;
  final String emoji;
  final Color  lightSquare;
  final Color  darkSquare;
  final Color  selectedSquare;
  final Color  lastMove;
  final Color  legalDot;
  final Color  inCheck;

  // ─── Thèmes disponibles ───────────────────────────────────────────────────

  static const classic = BoardTheme(
    name: 'Classique', emoji: '🤎',
    lightSquare:   Color(0xFFF0D9B5),
    darkSquare:    Color(0xFFB58863),
    selectedSquare: Color(0xFF7FC97F),
    lastMove:      Color(0xFFCDD26A),
    legalDot:      Color(0x4C000000),
    inCheck:       Color(0xCCFF3B30),
  );

  static const blue = BoardTheme(
    name: 'Bleu', emoji: '💙',
    lightSquare:   Color(0xFFDEE3E6),
    darkSquare:    Color(0xFF8CA2AD),
    selectedSquare: Color(0xFF50B2EF),
    lastMove:      Color(0xFF6FBCF0),
    legalDot:      Color(0x4C003A8C),
    inCheck:       Color(0xCCFF3B30),
  );

  static const green = BoardTheme(
    name: 'Vert', emoji: '💚',
    lightSquare:   Color(0xFFEEEED2),
    darkSquare:    Color(0xFF769656),
    selectedSquare: Color(0xFFF6F669),
    lastMove:      Color(0xFFBBCA2A),
    legalDot:      Color(0x4C1A1A1A),
    inCheck:       Color(0xCCFF3B30),
  );

  static const purple = BoardTheme(
    name: 'Violet', emoji: '💜',
    lightSquare:   Color(0xFFE8D5FF),
    darkSquare:    Color(0xFF9B59B6),
    selectedSquare: Color(0xFFFFD700),
    lastMove:      Color(0xFFFFE066),
    legalDot:      Color(0x4C2C0052),
    inCheck:       Color(0xCCFF3B30),
  );

  static const gray = BoardTheme(
    name: 'Gris', emoji: '🩶',
    lightSquare:   Color(0xFFEFEFEF),
    darkSquare:    Color(0xFF7B7B7B),
    selectedSquare: Color(0xFFFFD700),
    lastMove:      Color(0xFFFFE8A0),
    legalDot:      Color(0x4C000000),
    inCheck:       Color(0xCCFF3B30),
  );

  static const all = [classic, blue, green, purple, gray];

  static BoardTheme byName(String name) =>
      all.firstWhere((t) => t.name == name, orElse: () => classic);
}
