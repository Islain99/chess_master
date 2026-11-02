// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Avatar de joueur
//
// Trois formes, selon User.avatarUrl :
//   • « preset:<pièce>-<couleur> » : pièce d'échecs sur fond coloré, dessinée
//     localement (aucun fichier à héberger) ;
//   • URL HTTPS : photo (ex. fournie par Google / Facebook), avec repli sur
//     les initiales si elle ne se charge pas ;
//   • rien : initiale du nom sur fond de couleur stable (dérivée du nom).
//
// La liste des préréglages doit rester identique à
// apps/api/src/users/avatar-presets.ts (validation serveur).
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';

class AvatarPreset {
  const AvatarPreset(this.piece, this.colorName);

  final String piece; // king, queen, rook, bishop, knight, pawn
  final String colorName; // red, blue, green, purple, orange, teal

  String get id => '$piece-$colorName';
  String get value => 'preset:$id';

  static const pieces = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
  static const colorNames = ['red', 'blue', 'green', 'purple', 'orange', 'teal'];

  static const _glyphs = {
    'king': '♚', 'queen': '♛', 'rook': '♜', 'bishop': '♝', 'knight': '♞', 'pawn': '♟',
  };
  static const _colors = {
    'red': Color(0xFFD64545),
    'blue': Color(0xFF3B7DD8),
    'green': Color(0xFF3A9D5D),
    'purple': Color(0xFF8E5AC8),
    'orange': Color(0xFFE08A2E),
    'teal': Color(0xFF2A9D9D),
  };

  String get glyph => '${_glyphs[piece]}︎';
  Color get color => _colors[colorName]!;

  /// Les 36 combinaisons, dans le même ordre que l'API.
  static final all = [
    for (final p in pieces)
      for (final c in colorNames) AvatarPreset(p, c),
  ];

  /// « preset:knight-blue » → préréglage, sinon null.
  static AvatarPreset? parse(String? value) {
    if (value == null || !value.startsWith('preset:')) return null;
    final parts = value.substring(7).split('-');
    if (parts.length != 2 || !_glyphs.containsKey(parts[0]) || !_colors.containsKey(parts[1])) {
      return null;
    }
    return AvatarPreset(parts[0], parts[1]);
  }
}

class PlayerAvatar extends StatelessWidget {
  const PlayerAvatar({
    super.key,
    required this.displayName,
    this.avatarUrl,
    this.radius = 20,
  });

  final String displayName;
  final String? avatarUrl;
  final double radius;

  /// Initiale affichable même pour un nom vide ou commençant par un emoji.
  static String initialOf(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return '?';
    return String.fromCharCodes(trimmed.runes.take(1)).toUpperCase();
  }

  /// Couleur stable dérivée du nom (même joueur → même couleur partout).
  static Color colorFor(String name) {
    const palette = [
      Color(0xFFE94560), Color(0xFF3B7DD8), Color(0xFF3A9D5D),
      Color(0xFF8E5AC8), Color(0xFFE08A2E), Color(0xFF2A9D9D),
    ];
    final hash = name.codeUnits.fold<int>(0, (h, c) => (h * 31 + c) & 0x7fffffff);
    return palette[hash % palette.length];
  }

  @override
  Widget build(BuildContext context) {
    final preset = AvatarPreset.parse(avatarUrl);
    final initials = _Initials(
      text: initialOf(displayName),
      color: colorFor(displayName),
      radius: radius,
    );

    Widget child;
    if (preset != null) {
      child = CircleAvatar(
        radius: radius,
        backgroundColor: preset.color,
        child: Text(preset.glyph,
            style: TextStyle(fontSize: radius * 1.15, height: 1, color: Colors.white)),
      );
    } else if (avatarUrl != null && avatarUrl!.startsWith('https://')) {
      child = ClipOval(
        child: Image.network(
          avatarUrl!,
          width: radius * 2,
          height: radius * 2,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => initials,
          loadingBuilder: (_, image, progress) => progress == null ? image : initials,
        ),
      );
    } else {
      child = initials;
    }

    return Semantics(label: 'Avatar de $displayName', image: true, child: child);
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.text, required this.color, required this.radius});
  final String text;
  final Color color;
  final double radius;

  @override
  Widget build(BuildContext context) => CircleAvatar(
        radius: radius,
        backgroundColor: color,
        child: Text(text,
            style: TextStyle(color: Colors.white, fontSize: radius * 0.9, fontWeight: FontWeight.w700)),
      );
}
