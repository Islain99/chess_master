import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../game/providers/game_provider.dart';
import '../../game/screens/game_screen.dart';

/// Écran de configuration d'une partie contre l'IA.
/// Permet de choisir la cadence et le niveau de difficulté.
class AiSetupScreen extends ConsumerStatefulWidget {
  const AiSetupScreen({super.key});

  @override
  ConsumerState<AiSetupScreen> createState() => _AiSetupScreenState();
}

class _AiSetupScreenState extends ConsumerState<AiSetupScreen> {
  int _selectedLevel = 1;
  String _selectedTimeControl = 'RAPID';
  bool _loading = false;

  static const _levels = [
    (1, '🎲 Débutant', 'Coups aléatoires — idéal pour apprendre'),
    (2, '🧠 Facile', 'Recherche Minimax (2 coups) — erreurs fréquentes'),
    (3, '⚡ Intermédiaire', 'Alpha-Beta (3 coups) — joue sans blunder évident'),
  ];

  static const _timeControls = [
    ('BULLET', '⚡', 'Bullet', '1 min'),
    ('BLITZ', '🔥', 'Blitz', '5 min'),
    ('RAPID', '⏱', 'Rapide', '10 min'),
    ('CLASSICAL', '🕰', 'Classique', '30 min'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Partie contre l\'IA')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ─── Niveau ────────────────────────────────────────────────────
              const Text('Niveau de difficulté',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.5,
                  )),
              const Gap(12),

              ..._levels.map((l) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: _LevelCard(
                      level: l.$1,
                      emoji: l.$2,
                      title: l.$2.split(' ').skip(1).join(' '), // sans emoji
                      subtitle: l.$3,
                      selected: _selectedLevel == l.$1,
                      onTap: () => setState(() => _selectedLevel = l.$1),
                    ),
                  )),

              const Gap(24),

              // ─── Cadence ───────────────────────────────────────────────────
              const Text('Cadence',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0.5,
                  )),
              const Gap(12),
              Row(
                children: _timeControls.map((tc) {
                  final selected = _selectedTimeControl == tc.$1;
                  return Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: GestureDetector(
                        onTap: () =>
                            setState(() => _selectedTimeControl = tc.$1),
                        child: Container(
                          padding:
                              const EdgeInsets.symmetric(vertical: 10),
                          decoration: BoxDecoration(
                            color: selected
                                ? AppTheme.accent.withOpacity(0.2)
                                : AppTheme.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: selected
                                  ? AppTheme.accent
                                  : Colors.white.withOpacity(0.1),
                              width: selected ? 2 : 1,
                            ),
                          ),
                          child: Column(
                            children: [
                              Text(tc.$2,
                                  style: const TextStyle(fontSize: 18)),
                              const Gap(2),
                              Text(tc.$3,
                                  style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w500,
                                  )),
                              Text(tc.$4,
                                  style: TextStyle(
                                    color: Colors.white.withOpacity(0.4),
                                    fontSize: 10,
                                  )),
                            ],
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),

              const Spacer(),

              // ─── Bouton Jouer ──────────────────────────────────────────────
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.play_arrow),
                  label: _loading
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white),
                        )
                      : Text('Jouer — Niveau $_selectedLevel'),
                  onPressed: _loading ? null : _startGame,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _startGame() async {
    setState(() => _loading = true);
    try {
      await ref.read(gameProvider.notifier).createAiGame(
            aiLevel: _selectedLevel,
            timeControl: _selectedTimeControl,
          );
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(builder: (_) => const GameScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur : $e'),
            backgroundColor: AppTheme.accent,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({
    required this.level,
    required this.emoji,
    required this.title,
    required this.subtitle,
    required this.selected,
    required this.onTap,
  });

  final int level;
  final String emoji;
  final String title;
  final String subtitle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: selected ? AppTheme.accent.withOpacity(0.15) : AppTheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? AppTheme.accent : Colors.white.withOpacity(0.08),
            width: selected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Text(emoji, style: const TextStyle(fontSize: 28)),
            const Gap(14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Niveau $level — $title',
                    style: TextStyle(
                      color: selected ? Colors.white : Colors.white70,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const Gap(2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.4),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle, color: AppTheme.accent, size: 20),
          ],
        ),
      ),
    );
  }
}
