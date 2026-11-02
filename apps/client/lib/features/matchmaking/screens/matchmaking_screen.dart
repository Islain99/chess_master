import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../multiplayer/providers/multiplayer_provider.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/providers/auth_provider.dart';
import '../../auth/screens/login_screen.dart';
import '../../multiplayer/screens/online_game_screen.dart';
import '../providers/matchmaking_provider.dart';

/// Écran de matchmaking — cherche un adversaire de niveau similaire.
class MatchmakingScreen extends ConsumerStatefulWidget {
  const MatchmakingScreen({super.key});

  @override
  ConsumerState<MatchmakingScreen> createState() => _MatchmakingScreenState();
}

class _MatchmakingScreenState extends ConsumerState<MatchmakingScreen> {
  String _timeControl = 'RAPID';
  bool   _connecting = false;

  static const _controls = [
    ('BULLET', '⚡', '1 min', 'Bullet'),
    ('BLITZ',  '🔥', '5 min', 'Blitz'),
    ('RAPID',  '⏱',  '10 min', 'Rapide'),
    ('CLASSICAL', '🕰', '30 min', 'Classique'),
  ];

  @override
  void dispose() {
    ref.read(matchmakingProvider.notifier).reset();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mm   = ref.watch(matchmakingProvider);
    final auth = ref.watch(authProvider).valueOrNull;

    // Naviguer vers la partie quand le match est trouvé
    ref.listen(matchmakingProvider, (_, next) {
      if (next.isFound && next.gameId != null && mounted) {
        // Sprint 18 : la partie trouvée n'était jamais transmise au provider
        // multijoueur → OnlineGameScreen restait vide. On la rejoint ici.
        ref.read(multiplayerProvider.notifier).resumeGame(next.gameId!);
        ref.read(matchmakingProvider.notifier).reset();
        Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(builder: (_) => const OnlineGameScreen()),
        );
      }
    });

    if (!(auth?.isLoggedIn ?? false)) {
      return _LoginRequired(
        onLogin: () => Navigator.push(
          context,
          MaterialPageRoute<void>(
              builder: (_) => LoginScreen(onSuccess: () => setState(() {}))),
        ),
      );
    }

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Matchmaking'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () {
            ref.read(matchmakingProvider.notifier).leaveQueue();
            Navigator.pop(context);
          },
        ),
      ),
      body: mm.isSearching ? _buildSearching(mm) : _buildSetup(),
    );
  }

  // ─── Mode configuration ───────────────────────────────────────────────────

  Widget _buildSetup() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Gap(8),
          const Text('♟',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 52, color: Colors.white)),
          const Gap(4),
          const Text('Trouver un adversaire',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: Colors.white, fontSize: 18, fontWeight: FontWeight.w600)),
          const Gap(6),
          Text('Appariement par classement Elo',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withValues(alpha: 0.45), fontSize: 13)),
          const Gap(36),

          // ─── Sélection de cadence ──────────────────────────────────────
          const Text('Cadence',
              style: TextStyle(
                  color: Colors.white70, fontSize: 13, letterSpacing: 0.5)),
          const Gap(10),
          ...(_controls.map((c) {
            final selected = _timeControl == c.$1;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: GestureDetector(
                onTap: () => setState(() => _timeControl = c.$1),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: selected ? AppTheme.primary.withValues(alpha: 0.5) : AppTheme.surface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: selected ? AppTheme.accent : Colors.white.withValues(alpha: 0.08),
                      width: selected ? 1.5 : 1,
                    ),
                  ),
                  child: Row(
                    children: [
                      Text(c.$2, style: const TextStyle(fontSize: 22)),
                      const Gap(14),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(c.$4,
                              style: const TextStyle(
                                  color: Colors.white, fontWeight: FontWeight.w600)),
                          Text(c.$3,
                              style: TextStyle(
                                  color: Colors.white.withValues(alpha: 0.45), fontSize: 12)),
                        ],
                      ),
                      const Spacer(),
                      if (selected)
                        const Icon(Icons.check_circle, color: AppTheme.accent),
                    ],
                  ),
                ),
              ),
            );
          })),

          const Gap(28),
          ElevatedButton(
            onPressed: _connecting ? null : _startSearch,
            child: _connecting
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Chercher un adversaire'),
          ),
        ],
      ),
    );
  }

  // ─── Mode recherche ────────────────────────────────────────────────────────

  Widget _buildSearching(MatchmakingState mm) {
    final wait = mm.waitTime;
    final secs = wait.inSeconds % 60;
    final mins = wait.inMinutes;
    final timeStr = '${mins.toString().padLeft(2, '0')}:'
        '${secs.toString().padLeft(2, '0')}';

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Animation pulsante
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.9, end: 1.1),
              duration: const Duration(milliseconds: 800),
              curve: Curves.easeInOut,
              builder: (_, v, child) => Transform.scale(scale: v, child: child),
              child: Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  color: AppTheme.primary,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                        color: AppTheme.accent.withValues(alpha: 0.4),
                        blurRadius: 20,
                        spreadRadius: 5),
                  ],
                ),
                child: const Center(
                  child: Text('♟',
                      style: TextStyle(fontSize: 48, color: Colors.white)),
                ),
              ),
            ),

            const Gap(32),
            const Text('Recherche en cours…',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w600)),
            const Gap(8),
            Text(
              mm.elo != null
                  ? 'Elo ${mm.elo} · ${_timeControlLabel(mm.timeControl)}'
                  : _timeControlLabel(mm.timeControl),
              style: TextStyle(color: Colors.white.withValues(alpha: 0.55), fontSize: 14),
            ),

            const Gap(24),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(timeStr,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      fontFeatures: [FontFeature.tabularFigures()])),
            ),

            const Gap(8),
            Text('Plage Elo : ±${_eloRange(mm.waitTime)} pts',
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.35), fontSize: 12)),

            const Gap(40),
            OutlinedButton.icon(
              icon: const Icon(Icons.close, size: 18),
              label: const Text('Annuler la recherche'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.accent,
                side: const BorderSide(color: AppTheme.accent),
              ),
              onPressed: () {
                ref.read(matchmakingProvider.notifier).leaveQueue();
                Navigator.pop(context);
              },
            ),
          ],
        ),
      ),
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  Future<void> _startSearch() async {
    setState(() => _connecting = true);
    await ref.read(matchmakingProvider.notifier).joinQueue(
          timeControl: _timeControl);
    if (mounted) setState(() => _connecting = false);
  }

  String _timeControlLabel(String tc) {
    switch (tc) {
      case 'BULLET':    return 'Bullet (1 min)';
      case 'BLITZ':     return 'Blitz (5 min)';
      case 'RAPID':     return 'Rapide (10 min)';
      case 'CLASSICAL': return 'Classique (30 min)';
      default:          return tc;
    }
  }

  int _eloRange(Duration wait) {
    // Expansion : ±300 de départ, +100 toutes les 30 s
    return 300 + (wait.inSeconds ~/ 30) * 100;
  }
}

// ─── Écran connexion requise ──────────────────────────────────────────────────

class _LoginRequired extends StatelessWidget {
  const _LoginRequired({required this.onLogin});

  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Matchmaking')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Text('🔒',
                  style: TextStyle(fontSize: 56), textAlign: TextAlign.center),
              const Gap(20),
              const Text('Connexion requise',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.w600)),
              const Gap(10),
              Text('Le matchmaking nécessite un compte pour suivre votre classement Elo.',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.55), fontSize: 14)),
              const Gap(32),
              ElevatedButton(
                onPressed: onLogin,
                child: const Text('Se connecter'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
