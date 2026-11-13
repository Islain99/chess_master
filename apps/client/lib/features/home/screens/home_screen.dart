import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/player_avatar.dart';
import '../../game/providers/resumable_game_provider.dart';
import '../../history/screens/my_games_screen.dart';
import '../../profile/screens/profile_screen.dart';
import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../auth/screens/login_screen.dart';
import '../../game/providers/game_provider.dart';
import '../../game/screens/ai_setup_screen.dart';
import '../../game/screens/game_screen.dart';
import '../../game/screens/import_game_screen.dart';
import '../../leaderboard/screens/leaderboard_screen.dart';
import '../../matchmaking/screens/matchmaking_screen.dart';
import '../../multiplayer/screens/lobby_screen.dart';
import '../../notifications/providers/notifications_provider.dart';
import '../../notifications/screens/notifications_screen.dart';
import '../../notifications/widgets/push_prompt_card.dart';
import '../../settings/screens/settings_screen.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth  = ref.watch(authProvider).valueOrNull;
    final notif = auth?.isLoggedIn == true
        ? ref.watch(notificationsProvider)
        : null;

    return Scaffold(
      backgroundColor: AppTheme.background,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ─── En-tête ────────────────────────────────────────────────
              Row(children: [
                const Text('♟',
                    style: TextStyle(fontSize: 38, color: Colors.white)),
                const Gap(10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Échecs',
                          style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w700,
                              color: Colors.white)),
                      Text('Jouer · analyser · progresser',
                          style: TextStyle(
                              fontSize: 12,
                              color: Colors.white.withValues(alpha: 0.4))),
                    ],
                  ),
                ),
                // Badge notifications
                if (notif != null && notif.unreadCount > 0)
                  Stack(children: [
                    IconButton(
                      icon: const Icon(Icons.notifications_outlined,
                          color: Colors.white70),
                      onPressed: () => Navigator.push(
                        context,
                        MaterialPageRoute<void>(
                            builder: (_) => const NotificationsScreen()),
                      ),
                    ),
                    Positioned(
                      right: 8, top: 8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(
                          color: AppTheme.accent,
                          shape: BoxShape.circle,
                        ),
                        child: Text(
                          '${notif.unreadCount > 9 ? '9+' : notif.unreadCount}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w700),
                        ),
                      ),
                    ),
                  ]),
                // Bouton paramètres (polissage : il était présent en double)
                IconButton(
                  tooltip: 'Paramètres',
                  icon: const Icon(Icons.settings_outlined, color: Colors.white54, size: 22),
                  onPressed: () => Navigator.push(context,
                      MaterialPageRoute<void>(builder: (_) => const SettingsScreen())),
                ),
                const Gap(4),
                // Profil / connexion
                if (auth?.isLoggedIn ?? false)
                  _UserAvatar(
                    user: auth!.user!,
                    onTap: () => _openProfile(context),
                  )
                else
                  TextButton.icon(
                    onPressed: () => Navigator.push(context,
                        MaterialPageRoute<void>(
                            builder: (_) => const LoginScreen())),
                    icon: const Icon(Icons.login, size: 18),
                    label: const Text('Connexion'),
                  ),
              ]),

              const Gap(28),

              // ─── Carte bienvenue ─────────────────────────────────────────
              if (auth?.isLoggedIn ?? false) ...[
                _WelcomeCard(user: auth!.user!, onTap: () => _openProfile(context)),
                const Gap(16),
              ],

              // ─── Notifications / installation sur iPhone (novembre 2026) ─
              const PushPromptCard(dismissible: true),

              // ─── Reprendre (sprint 18) ───────────────────────────────────
              const _ResumeCard(),

              // ─── Modes de jeu ─────────────────────────────────────────────
              _ModeCard(
                icon: '⚔️', title: 'Partie locale',
                subtitle: 'Deux joueurs sur le même appareil',
                onTap: () => _startLocalGame(context, ref),
              ),
              const Gap(8),
              _ModeCard(
                icon: '🤖', title: 'Contre l\'IA',
                subtitle: 'Niveaux 1–5, Stockfish configurable',
                onTap: () => Navigator.push(context,
                    MaterialPageRoute<void>(builder: (_) => const AiSetupScreen())),
              ),
              const Gap(8),
              _ModeCard(
                icon: '🔍', title: 'Matchmaking classé',
                subtitle: 'Trouver un adversaire par Elo',
                onTap: () => Navigator.push(context,
                    MaterialPageRoute<void>(builder: (_) => const MatchmakingScreen())),
              ),
              const Gap(8),
              _ModeCard(
                icon: '🌐', title: 'Salle privée',
                subtitle: 'Jouer avec un ami par code d\'invitation',
                onTap: () => Navigator.push(context,
                    MaterialPageRoute<void>(builder: (_) => const LobbyScreen())),
              ),
              const Gap(8),
              _ModeCard(
                icon: '📂', title: 'Importer FEN / PGN',
                subtitle: 'Charger une position ou une partie',
                onTap: () => Navigator.push(context,
                    MaterialPageRoute<void>(builder: (_) => const ImportGameScreen())),
              ),

              const Gap(24),

              // ─── Outils ───────────────────────────────────────────────────
              const Text('Statistiques',
                  style: TextStyle(
                      color: Colors.white70, fontSize: 13,
                      fontWeight: FontWeight.w500, letterSpacing: 0.5)),
              const Gap(10),
              Row(children: [
                if (auth?.isLoggedIn ?? false) ...[
                  Expanded(
                    child: _ToolCard(
                      icon: Icons.history,
                      label: 'Mes parties',
                      onTap: () => Navigator.push(context,
                          MaterialPageRoute<void>(builder: (_) => const MyGamesScreen())),
                    ),
                  ),
                  const Gap(10),
                ],
                Expanded(
                  child: _ToolCard(
                    icon: Icons.leaderboard,
                    label: 'Classement',
                    onTap: () => Navigator.push(context,
                        MaterialPageRoute<void>(
                            builder: (_) => const LeaderboardScreen())),
                  ),
                ),
                const Gap(10),
                Expanded(
                  child: _ToolCard(
                    icon: Icons.notifications_outlined,
                    label: 'Notifications',
                    badge: notif?.unreadCount,
                    onTap: () => Navigator.push(context,
                        MaterialPageRoute<void>(
                            builder: (_) => const NotificationsScreen())),
                  ),
                ),
              ]),

              const Gap(24),

              // ─── Cadence rapide ────────────────────────────────────────
              const Text('Partie locale rapide',
                  style: TextStyle(
                      color: Colors.white70, fontSize: 13,
                      fontWeight: FontWeight.w500, letterSpacing: 0.5)),
              const Gap(10),
              _TimeControlRow(
                  onStart: (tc) => _startLocalGame(context, ref, timeControl: tc)),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _startLocalGame(BuildContext context, WidgetRef ref,
      {String timeControl = 'RAPID'}) async {
    await ref
        .read(gameProvider.notifier)
        .createLocalGame(timeControl: timeControl);
    if (context.mounted) {
      Navigator.push(context,
          MaterialPageRoute<void>(builder: (_) => const GameScreen()));
    }
  }

  /// Sprint 18 : écran Profil complet (remplace l'ancienne feuille modale).
  void _openProfile(BuildContext context) {
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const ProfileScreen()));
  }
}

// ─── Widgets utilitaires ──────────────────────────────────────────────────────

class _UserAvatar extends StatelessWidget {
  const _UserAvatar({required this.user, required this.onTap});
  final AuthUser user;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: PlayerAvatar(displayName: user.displayName, avatarUrl: user.avatarUrl, radius: 18),
    );
  }
}

class _WelcomeCard extends StatelessWidget {
  const _WelcomeCard({required this.user, required this.onTap});
  final AuthUser user;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(onTap: onTap, child: Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppTheme.primary, AppTheme.primary.withValues(alpha: 0.5)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(children: [
        PlayerAvatar(displayName: user.displayName, avatarUrl: user.avatarUrl, radius: 22),
        const Gap(14),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Bienvenue, ${user.displayName} !',
                style: const TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w600, fontSize: 15)),
            const Gap(2),
            Text(user.email,
                style: TextStyle(
                    color: Colors.white.withValues(alpha: 0.55), fontSize: 12)),
          ]),
        ),
      ]),
    ));
  }
}

class _ModeCard extends StatelessWidget {
  const _ModeCard({
    required this.icon, required this.title,
    required this.subtitle, required this.onTap,
  });
  final String icon, title, subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        onTap: onTap, borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(children: [
            Text(icon, style: const TextStyle(fontSize: 26)),
            const Gap(14),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title,
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 15, fontWeight: FontWeight.w600)),
                const Gap(2),
                Text(subtitle,
                    style: TextStyle(
                        color: Colors.white.withValues(alpha: 0.5), fontSize: 12)),
              ]),
            ),
            const Icon(Icons.arrow_forward_ios, size: 15, color: Colors.white54),
          ]),
        ),
      ),
    );
  }
}

class _ToolCard extends StatelessWidget {
  const _ToolCard({
    required this.icon, required this.label,
    required this.onTap, this.badge,
  });
  final IconData icon;
  final String   label;
  final int?     badge;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        decoration: BoxDecoration(
          color: AppTheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Stack(children: [
            Icon(icon, color: Colors.white70, size: 22),
            if (badge != null && badge! > 0)
              Positioned(
                right: 0, top: 0,
                child: Container(
                  width: 8, height: 8,
                  decoration: const BoxDecoration(
                      color: AppTheme.accent, shape: BoxShape.circle),
                ),
              ),
          ]),
          const Gap(8),
          Text(label,
              style: const TextStyle(color: Colors.white70, fontSize: 13)),
        ]),
      ),
    );
  }
}

class _TimeControlRow extends StatelessWidget {
  const _TimeControlRow({required this.onStart});
  final void Function(String) onStart;
  static const _controls = [
    ('BULLET','⚡','1 min'), ('BLITZ','🔥','5 min'),
    ('RAPID','⏱','10 min'), ('CLASSICAL','🕰','30 min'),
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
                padding: const EdgeInsets.symmetric(vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.1)),
                ),
                child: Column(children: [
                  Text(c.$2, style: const TextStyle(fontSize: 18)),
                  const Gap(2),
                  Text(c.$3,
                      style: TextStyle(
                          fontSize: 11,
                          color: Colors.white.withValues(alpha: 0.5))),
                ]),
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

/// Sprint 18 : carte « Reprendre la partie » (partie locale / IA non terminée).
class _ResumeCard extends ConsumerWidget {
  const _ResumeCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final resumable = ref.watch(resumableGameProvider).valueOrNull;
    if (resumable == null) return const SizedBox.shrink();

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        color: AppTheme.accent.withValues(alpha: 0.18),
        child: ListTile(
          leading: const Icon(Icons.play_circle_fill, color: AppTheme.accent, size: 34),
          title: const Text('Reprendre la partie',
              style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
          subtitle: Text(resumable.description, style: const TextStyle(color: Colors.white60)),
          trailing: const Icon(Icons.chevron_right, color: Colors.white54),
          onTap: () async {
            await ref.read(gameProvider.notifier).resumeGame(resumable.id);
            if (!context.mounted) return;
            await Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const GameScreen()));
            ref.invalidate(resumableGameProvider); // terminée entre-temps ?
          },
        ),
      ),
    );
  }
}
