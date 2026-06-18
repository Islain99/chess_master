import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract final class AppTheme {
  // ─── Couleurs du plateau ───────────────────────────────────────────────
  static const Color lightSquare = Color(0xFFF0D9B5);
  static const Color darkSquare  = Color(0xFFB58863);
  static const Color selectedSquare    = Color(0xFF7FC97F);
  static const Color lastMoveHighlight = Color(0xFFCDD26A);
  static const Color legalMoveDot      = Color(0x4C000000);
  static const Color inCheckSquare     = Color(0xCCFF3B30);

  // ─── Couleurs de l'interface ────────────────────────────────────────────
  static const Color background = Color(0xFF1A1A2E);
  static const Color surface    = Color(0xFF16213E);
  static const Color primary    = Color(0xFF0F3460);
  static const Color accent     = Color(0xFFE94560);

  // ─── Thèmes Material ────────────────────────────────────────────────────
  static ThemeData get dark {
    const colorScheme = ColorScheme.dark(
      background: background,
      surface: surface,
      primary: accent,
      onPrimary: Colors.white,
      secondary: primary,
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
      scaffoldBackgroundColor: background,
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        elevation: 0,
        centerTitle: true,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        ),
      ),
      cardTheme: CardTheme(
        color: surface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: Colors.white.withOpacity(0.08)),
        ),
      ),
    );
  }

  static ThemeData get light {
    const colorScheme = ColorScheme.light(
      background: Color(0xFFF5F5F5),
      surface: Colors.white,
      primary: Color(0xFF0F3460),
      onPrimary: Colors.white,
      secondary: Color(0xFFE94560),
    );
    return ThemeData(
      useMaterial3: true,
      colorScheme: colorScheme,
      textTheme: GoogleFonts.interTextTheme(),
      scaffoldBackgroundColor: const Color(0xFFF5F5F5),
    );
  }
}
