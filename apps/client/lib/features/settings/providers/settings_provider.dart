import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../../core/theme/board_themes.dart';

class AppSettings {
  const AppSettings({
    this.boardThemeId     = 'classic',
    this.showCoordinates  = true,
    this.autoFlipForLocal = false,
    this.soundEnabled     = true,
    this.confirmResign    = true,
    this.showLegalMoves   = true,
  });
  final String boardThemeId;
  final bool   showCoordinates;
  final bool   autoFlipForLocal;
  final bool   soundEnabled;
  final bool   confirmResign;
  final bool   showLegalMoves;

  BoardTheme get boardTheme => BoardTheme.byId(boardThemeId);

  AppSettings copyWith({
    String? boardThemeId, bool? showCoordinates, bool? autoFlipForLocal,
    bool? soundEnabled, bool? confirmResign, bool? showLegalMoves,
  }) => AppSettings(
    boardThemeId:     boardThemeId     ?? this.boardThemeId,
    showCoordinates:  showCoordinates  ?? this.showCoordinates,
    autoFlipForLocal: autoFlipForLocal ?? this.autoFlipForLocal,
    soundEnabled:     soundEnabled     ?? this.soundEnabled,
    confirmResign:    confirmResign    ?? this.confirmResign,
    showLegalMoves:   showLegalMoves   ?? this.showLegalMoves,
  );
}

final settingsProvider =
    StateNotifierProvider<SettingsNotifier, AppSettings>((ref) {
  return SettingsNotifier();
});

class SettingsNotifier extends StateNotifier<AppSettings> {
  SettingsNotifier() : super(const AppSettings()) { _load(); }

  Future<void> _load() async {
    final p = await SharedPreferences.getInstance();
    state = AppSettings(
      boardThemeId:     p.getString('boardTheme')      ?? 'classic',
      showCoordinates:  p.getBool('showCoordinates')   ?? true,
      autoFlipForLocal: p.getBool('autoFlipForLocal')  ?? false,
      soundEnabled:     p.getBool('soundEnabled')      ?? true,
      confirmResign:    p.getBool('confirmResign')     ?? true,
      showLegalMoves:   p.getBool('showLegalMoves')    ?? true,
    );
  }

  Future<void> setBoardTheme(String id) async {
    state = state.copyWith(boardThemeId: id);
    (await SharedPreferences.getInstance()).setString('boardTheme', id);
  }

  Future<void> toggle(String key, bool value) async {
    (await SharedPreferences.getInstance()).setBool(key, value);
    state = switch (key) {
      'showCoordinates'  => state.copyWith(showCoordinates:  value),
      'autoFlipForLocal' => state.copyWith(autoFlipForLocal: value),
      'soundEnabled'     => state.copyWith(soundEnabled:     value),
      'confirmResign'    => state.copyWith(confirmResign:    value),
      'showLegalMoves'   => state.copyWith(showLegalMoves:   value),
      _ => state,
    };
  }
}
