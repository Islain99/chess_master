import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/settings/board_theme.dart';
import '../../../core/settings/settings_provider.dart';
import '../../../core/theme/app_theme.dart';

/// Écran des paramètres : thème plateau, style pièces, options UI.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(settingsProvider);
    final notifier = ref.read(settingsProvider.notifier);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Paramètres')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ─── Thème du plateau ───────────────────────────────────────────
          _Section(title: 'Plateau'),
          const Gap(10),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: BoardTheme.all.map((theme) {
              final selected = settings.boardThemeName == theme.name;
              return GestureDetector(
                onTap: () => notifier.setBoardTheme(theme.name),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  width: 80, height: 80,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: selected ? AppTheme.accent : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Column(
                      children: [
                        Expanded(
                          child: Row(
                            children: [
                              Expanded(child: _Sq(theme.lightSquare)),
                              Expanded(child: _Sq(theme.darkSquare)),
                            ],
                          ),
                        ),
                        Expanded(
                          child: Row(
                            children: [
                              Expanded(child: _Sq(theme.darkSquare)),
                              Expanded(child: _Sq(theme.lightSquare)),
                            ],
                          ),
                        ),
                        Container(
                          color: AppTheme.surface,
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(theme.emoji,
                                  style: const TextStyle(fontSize: 12)),
                              const Gap(4),
                              Text(theme.name,
                                  style: const TextStyle(
                                      color: Colors.white70, fontSize: 10)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          const Gap(28),

          // ─── Style des pièces ────────────────────────────────────────────
          _Section(title: 'Pièces'),
          const Gap(10),
          Row(
            children: PieceStyle.values.map((s) {
              final selected = settings.pieceStyle == s;
              final label = switch (s) {
                PieceStyle.classic => ('♛', 'Classique'),
                PieceStyle.solid   => ('♛', 'Contrasté'),
                PieceStyle.outline => ('♛', 'Contour'),
              };
              return Expanded(
                child: Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () => notifier.setPieceStyle(s),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppTheme.primary.withOpacity(0.5)
                            : AppTheme.surface,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: selected ? AppTheme.accent : Colors.white12,
                          width: selected ? 1.5 : 1,
                        ),
                      ),
                      child: Column(
                        children: [
                          Text(label.$1,
                              style: TextStyle(
                                fontSize: 28,
                                color: s == PieceStyle.outline
                                    ? Colors.transparent
                                    : Colors.white,
                                shadows: s == PieceStyle.solid
                                    ? null
                                    : const [
                                        Shadow(
                                            color: Colors.black54,
                                            blurRadius: 3)
                                      ],
                                // Simule l'outline avec strokeWidth via foreground
                                foreground: s == PieceStyle.outline
                                    ? (Paint()
                                      ..style = PaintingStyle.stroke
                                      ..strokeWidth = 1.5
                                      ..color = Colors.white)
                                    : null,
                              )),
                          const Gap(4),
                          Text(label.$2,
                              style: const TextStyle(
                                  color: Colors.white70, fontSize: 11)),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),

          const Gap(28),

          // ─── Options d'affichage ─────────────────────────────────────────
          _Section(title: 'Affichage'),
          const Gap(10),
          _SwitchTile(
            icon: Icons.grid_on,
            label: 'Afficher les coordonnées',
            value: settings.showCoordinates,
            onToggle: () => notifier.toggle('show_coords'),
          ),
          _SwitchTile(
            icon: Icons.touch_app,
            label: 'Afficher les coups légaux',
            value: settings.showLegalMoves,
            onToggle: () => notifier.toggle('show_legal'),
          ),
          _SwitchTile(
            icon: Icons.animation,
            label: 'Animer les coups',
            value: settings.animateMoves,
            onToggle: () => notifier.toggle('animate_moves'),
          ),
          _SwitchTile(
            icon: Icons.flip,
            label: 'Retourner automatiquement (IA)',
            value: settings.autoFlipBoard,
            onToggle: () => notifier.toggle('auto_flip'),
          ),

          const Gap(20),

          // ─── Options son ─────────────────────────────────────────────────
          _Section(title: 'Son'),
          const Gap(10),
          _SwitchTile(
            icon: Icons.volume_up,
            label: 'Effets sonores',
            subtitle: 'Son des coups et notifications',
            value: settings.soundEnabled,
            onToggle: () => notifier.toggle('sound'),
          ),

          const Gap(40),
        ],
      ),
    );
  }
}

class _Sq extends StatelessWidget {
  const _Sq(this.color);
  final Color color;

  @override
  Widget build(BuildContext context) =>
      Container(color: color);
}

class _Section extends StatelessWidget {
  const _Section({required this.title});
  final String title;

  @override
  Widget build(BuildContext context) => Text(
        title,
        style: const TextStyle(
          color: Colors.white70,
          fontSize: 13,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      );
}

class _SwitchTile extends StatelessWidget {
  const _SwitchTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.onToggle,
    this.subtitle,
  });

  final IconData icon;
  final String   label;
  final String?  subtitle;
  final bool     value;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
      ),
      child: SwitchListTile(
        secondary:     Icon(icon, color: Colors.white54, size: 22),
        title:         Text(label, style: const TextStyle(
            color: Colors.white, fontSize: 14)),
        subtitle:      subtitle != null
            ? Text(subtitle!,
                style: TextStyle(
                    color: Colors.white.withOpacity(0.4), fontSize: 11))
            : null,
        value:         value,
        onChanged:     (_) => onToggle(),
        activeColor:   AppTheme.accent,
        shape:         RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
