import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'board_theme.dart';

// ─── Modèle ───────────────────────────────────────────────────────────────────

class AppSettings {
  const AppSettings({
    this.boardThemeName  = 'Classique',
    this.pieceStyle      = PieceStyle.classic,
    this.showCoordinates = true,
    this.animateMoves    = true,
    this.showLegalMoves  = true,
    this.soundEnabled    = false,
    this.autoFlipBoard   = false,
  });

  final String     boardThemeName;
  final PieceStyle pieceStyle;
  final bool       showCoordinates;
  final bool       animateMoves;
  final bool       showLegalMoves;
  final bool       soundEnabled;
  final bool       autoFlipBoard;

  BoardTheme get boardTheme => BoardTheme.byName(boardThemeName);

  AppSettings copyWith({
    String?     boardThemeName,
    PieceStyle? pieceStyle,
    bool?       showCoordinates,
    bool?       animateMoves,
    bool?       showLegalMoves,
    bool?       soundEnabled,
    bool?       autoFlipBoard,
  }) => AppSettings(
    boardThemeName:  boardThemeName  ?? this.boardThemeName,
    pieceStyle:      pieceStyle      ?? this.pieceStyle,
    showCoordinates: showCoordinates ?? this.showCoordinates,
    animateMoves:    animateMoves    ?? this.animateMoves,
    showLegalMoves:  showLegalMoves  ?? this.showLegalMoves,
    soundEnabled:    soundEnabled    ?? this.soundEnabled,
    autoFlipBoard:   autoFlipBoard   ?? this.autoFlipBoard,
  );
}

/// Style de rendu des pièces (index persisté : ne pas réordonner, ajouter à la fin).
/// Sprint 18 : `letters` (R D T F C P) pour l'accessibilité.
enum PieceStyle { classic, solid, outline, letters }

// ─── Provider ─────────────────────────────────────────────────────────────────

final settingsProvider =
    StateNotifierProvider<SettingsNotifier, AppSettings>(
  (ref) => SettingsNotifier(),
);

class SettingsNotifier extends StateNotifier<AppSettings> {
  SettingsNotifier() : super(const AppSettings()) {
    _load();
  }

  static const _kTheme        = 'board_theme';
  static const _kPieceStyle   = 'piece_style';
  static const _kCoords       = 'show_coords';
  static const _kAnimate      = 'animate_moves';
  static const _kLegal        = 'show_legal';
  static const _kSound        = 'sound';
  static const _kAutoFlip     = 'auto_flip';

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    state = AppSettings(
      boardThemeName:  p.getString(_kTheme)      ?? 'Classique',
      // Sprint 18 : index hors bornes (valeur corrompue) → style par défaut.
      pieceStyle:      _pieceStyleAt(p.getInt(_kPieceStyle)),
      showCoordinates: p.getBool(_kCoords)        ?? true,
      animateMoves:    p.getBool(_kAnimate)       ?? true,
      showLegalMoves:  p.getBool(_kLegal)         ?? true,
      soundEnabled:    p.getBool(_kSound)         ?? false,
      autoFlipBoard:   p.getBool(_kAutoFlip)      ?? false,
    );
  }

  Future<void> setBoardTheme(String name) async {
    state = state.copyWith(boardThemeName: name);
    (await SharedPreferences.getInstance()).setString(_kTheme, name);
  }

  Future<void> setPieceStyle(PieceStyle s) async {
    state = state.copyWith(pieceStyle: s);
    (await SharedPreferences.getInstance()).setInt(_kPieceStyle, s.index);
  }

  Future<void> toggle(String key) async {
    final p = await SharedPreferences.getInstance();
    switch (key) {
      case _kCoords:
        state = state.copyWith(showCoordinates: !state.showCoordinates);
        p.setBool(_kCoords,  state.showCoordinates);
      case _kAnimate:
        state = state.copyWith(animateMoves: !state.animateMoves);
        p.setBool(_kAnimate, state.animateMoves);
      case _kLegal:
        state = state.copyWith(showLegalMoves: !state.showLegalMoves);
        p.setBool(_kLegal,   state.showLegalMoves);
      case _kSound:
        state = state.copyWith(soundEnabled: !state.soundEnabled);
        p.setBool(_kSound,   state.soundEnabled);
      case _kAutoFlip:
        state = state.copyWith(autoFlipBoard: !state.autoFlipBoard);
        p.setBool(_kAutoFlip, state.autoFlipBoard);
    }
  }
}

PieceStyle _pieceStyleAt(int? index) =>
    index != null && index >= 0 && index < PieceStyle.values.length
        ? PieceStyle.values[index]
        : PieceStyle.classic;
