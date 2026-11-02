import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/game_provider.dart';
import 'game_screen.dart';

/// Écran de configuration d'une partie contre l'IA — niveaux 1 à 5.
class AiSetupScreen extends ConsumerStatefulWidget {
  const AiSetupScreen({super.key});

  @override
  ConsumerState<AiSetupScreen> createState() => _AiSetupScreenState();
}

class _AiSetupScreenState extends ConsumerState<AiSetupScreen> {
  int _selectedLevel = 1;
  String _selectedTimeControl = 'RAPID';
  int _targetElo = 1500; // utilisé uniquement au niveau 5
  bool _loading = false;

  static const _levels = [
    _AiLevel(
      level: 1,
      stars: 1,
      label: 'Débutant',
      description: 'Coups aléatoires valides — apprendre sans pression',
      engine: 'Moteur aléatoire',
    ),
    _AiLevel(
      level: 2,
      stars: 2,
      label: 'Facile',
      description: 'Minimax profondeur 2 — capture et évite les prises',
      engine: 'Minimax d=2',
    ),
    _AiLevel(
      level: 3,
      stars: 3,
      label: 'Intermédiaire',
      description: 'Alpha-Beta profondeur 4 — positionnement et tactique',
      engine: 'Alpha-Beta d=4',
    ),
    _AiLevel(
      level: 4,
      stars: 4,
      label: 'Avancé',
      description: 'Iterative Deepening + TT — planification à long terme',
      engine: 'IDS + TT',
    ),
    _AiLevel(
      level: 5,
      stars: 5,
      label: 'Expert',
      description: 'Stockfish avec Elo configurable — adversaire redoutable',
      engine: 'Stockfish',
    ),
  ];

  static const _controls = [
    ('BULLET', '⚡ Bullet', '1 min'),
    ('BLITZ', '🔥 Blitz', '5 min'),
    ('RAPID', '⏱ Rapide', '10 min'),
    ('CLASSICAL', '🕰 Classique', '30 min'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Contre l\'IA')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ─── Sélection du niveau ───────────────────────────────────────
            const _SectionTitle('Niveau'),
            const Gap(12),
            ..._levels.map((l) => _LevelCard(
                  level: l,
                  isSelected: _selectedLevel == l.level,
                  onTap: () => setState(() => _selectedLevel = l.level),
                )),

            // ─── Elo cible (niveau 5 uniquement) ─────────────────────────
            if (_selectedLevel == 5) ...[
              const Gap(24),
              _EloSlider(
                elo: _targetElo,
                onChanged: (v) => setState(() => _targetElo = v),
              ),
            ],

            const Gap(28),

            // ─── Cadence ──────────────────────────────────────────────────
            const _SectionTitle('Cadence'),
            const Gap(12),
            Row(
              children: _controls.map((c) {
                final selected = _selectedTimeControl == c.$1;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () =>
                          setState(() => _selectedTimeControl = c.$1),
                      child: Container(
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        decoration: BoxDecoration(
                          color: selected ? AppTheme.accent : AppTheme.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: selected
                                ? AppTheme.accent
                                : Colors.white.withValues(alpha: 0.1),
                          ),
                        ),
                        child: Column(
                          children: [
                            Text(c.$2,
                                style: const TextStyle(
                                    fontSize: 12, color: Colors.white)),
                            const Gap(2),
                            Text(c.$3,
                                style: TextStyle(
                                    fontSize: 11,
                                    color: Colors.white.withValues(alpha: 0.5))),
                          ],
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),

            const Gap(40),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _startGame,
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Text(
                        _selectedLevel == 5
                            ? 'Jouer contre Stockfish (Elo $_targetElo)'
                            : 'Jouer',
                      ),
              ),
            ),
          ],
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
            aiTargetElo: _selectedLevel == 5 ? _targetElo : null,
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

// ─── Section title ────────────────────────────────────────────────────────────

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: const TextStyle(
          color: Colors.white70,
          fontSize: 14,
          fontWeight: FontWeight.w500,
          letterSpacing: 0.5,
        ));
  }
}

// ─── Carte de niveau ─────────────────────────────────────────────────────────

class _AiLevel {
  const _AiLevel({
    required this.level,
    required this.stars,
    required this.label,
    required this.description,
    required this.engine,
  });

  final int level;
  final int stars;
  final String label;
  final String description;
  final String engine;
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({
    required this.level,
    required this.isSelected,
    required this.onTap,
  });

  final _AiLevel level;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: isSelected
                ? AppTheme.primary.withValues(alpha: 0.6)
                : AppTheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: isSelected
                  ? AppTheme.accent
                  : Colors.white.withValues(alpha: 0.08),
              width: isSelected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Text('⭐' * level.stars,
                  style: const TextStyle(fontSize: 14)),
              const Gap(10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(level.label,
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                              fontSize: 14,
                            )),
                        const Gap(6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppTheme.primary,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(level.engine,
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.7),
                                fontSize: 10,
                              )),
                        ),
                      ],
                    ),
                    const Gap(3),
                    Text(level.description,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.5),
                          fontSize: 12,
                        )),
                  ],
                ),
              ),
              if (isSelected)
                const Icon(Icons.check_circle, color: AppTheme.accent, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── Slider Elo (niveau 5) ───────────────────────────────────────────────────

class _EloSlider extends StatelessWidget {
  const _EloSlider({required this.elo, required this.onChanged});

  final int elo;
  final void Function(int) onChanged;

  String _eloLabel(int e) {
    if (e < 1000) return 'Débutant (~$e Elo)';
    if (e < 1400) return 'Intermédiaire (~$e Elo)';
    if (e < 1800) return 'Avancé (~$e Elo)';
    if (e < 2200) return 'Expert (~$e Elo)';
    return 'Maître (~$e Elo)';
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Elo cible Stockfish',
                  style: TextStyle(color: Colors.white70, fontSize: 13)),
              Text(_eloLabel(elo),
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  )),
            ],
          ),
          Slider(
            min: 800,
            max: 3000,
            divisions: 22,
            value: elo.toDouble(),
            onChanged: (v) => onChanged(v.round()),
            activeColor: AppTheme.accent,
            inactiveColor: Colors.white12,
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('800', style: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 11)),
              Text('3000', style: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }
}
