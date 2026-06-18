import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../game/providers/game_provider.dart';
import '../../game/screens/game_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ─── En-tête ───────────────────────────────────────────────
              Row(
                children: [
                  const Text(
                    '♟',
                    style: TextStyle(fontSize: 40, color: Colors.white),
                  ),
                  const Gap(12),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'Échecs',
                        style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w700,
                          color: Colors.white,
                        ),
                      ),
                      Text(
                        'Sprint 1 — mode local',
                        style: TextStyle(
                          fontSize: 13,
                          color: Colors.white.withOpacity(0.4),
                        ),
                      ),
                    ],
                  ),
                ],
              ),

              const Gap(40),

              // ─── Boutons de mode de jeu ────────────────────────────────
              _ModeCard(
                icon: '⚔️',
                title: 'Partie locale',
                subtitle: 'Deux joueurs sur le même appareil',
                enabled: true,
                onTap: () => _startLocalGame(context, ref),
              ),
              const Gap(12),
              _ModeCard(
                icon: '🤖',
                title: 'Contre l\'IA',
                subtitle: 'Disponible au sprint 3',
                enabled: false,
                onTap: null,
              ),
              const Gap(12),
              _ModeCard(
                icon: '🌐',
                title: 'Multijoueur en ligne',
                subtitle: 'Disponible au sprint 6',
                enabled: false,
                onTap: null,
              ),

              const Gap(32),

              // ─── Cadence ───────────────────────────────────────────────
              const Text(
                'Cadence',
                style: TextStyle(
                  color: Colors.white70,
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.5,
                ),
              ),
              const Gap(12),
              _TimeControlRow(onStart: (tc) => _startLocalGame(context, ref, timeControl: tc)),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _startLocalGame(
    BuildContext context,
    WidgetRef ref, {
    String timeControl = 'RAPID',
  }) async {
    final notifier = ref.read(gameProvider.notifier);
    await notifier.createLocalGame(timeControl: timeControl);

    if (context.mounted) {
      Navigator.push(
        context,
        MaterialPageRoute<void>(builder: (_) => const GameScreen()),
      );
    }
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.enabled,
    required this.onTap,
  });

  final String icon;
  final String title;
  final String subtitle;
  final bool enabled;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1.0 : 0.4,
      child: Card(
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(18),
            child: Row(
              children: [
                Text(icon, style: const TextStyle(fontSize: 28)),
                const Gap(16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const Gap(2),
                      Text(
                        subtitle,
                        style: TextStyle(
                          color: Colors.white.withOpacity(0.5),
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
                if (enabled)
                  const Icon(Icons.arrow_forward_ios,
                      size: 16, color: Colors.white54),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _TimeControlRow extends StatelessWidget {
  const _TimeControlRow({required this.onStart});
  final void Function(String) onStart;

  static const _controls = [
    ('BULLET', '⚡ Bullet', '1 min'),
    ('BLITZ', '🔥 Blitz', '5 min'),
    ('RAPID', '⏱ Rapide', '10 min'),
    ('CLASSICAL', '🕰 Classique', '30 min'),
  ];

  @override
  Widget build(BuildContext context) {
    return Row(
      children: _controls.map((c) {
        return Expanded(
          child: Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => onStart(c.$1),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: Colors.white.withOpacity(0.1),
                  ),
                ),
                child: Column(
                  children: [
                    Text(c.$2,
                        style: const TextStyle(
                            fontSize: 13, color: Colors.white)),
                    const Gap(2),
                    Text(c.$3,
                        style: TextStyle(
                            fontSize: 11,
                            color: Colors.white.withOpacity(0.4))),
                  ],
                ),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}
