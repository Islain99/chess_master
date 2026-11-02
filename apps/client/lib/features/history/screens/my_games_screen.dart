// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — « Mes parties » : reprendre une partie en cours, revoir les autres
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';

import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/player_avatar.dart';
import '../../auth/providers/auth_provider.dart';
import '../../game/providers/game_provider.dart';
import '../../game/screens/game_screen.dart';
import '../../multiplayer/providers/multiplayer_provider.dart';
import '../../multiplayer/screens/online_game_screen.dart';
import '../../replay/screens/game_replay_screen.dart';
import '../models/game_summary.dart';

/// Parties de l'utilisateur connecté, par statut (« ONGOING » ou « FINISHED »).
final myGamesProvider =
    FutureProvider.autoDispose.family<List<GameSummary>, String>((ref, status) async {
  final user = ref.watch(authProvider).valueOrNull?.user;
  if (user == null) return const [];
  final data = await ref
      .watch(apiClientProvider)
      .get('/users/${user.id}/games?status=$status&pageSize=50');
  return (data['items'] as List? ?? [])
      .cast<Map<String, dynamic>>()
      .map(GameSummary.fromJson)
      .toList();
});

class MyGamesScreen extends ConsumerWidget {
  const MyGamesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        backgroundColor: AppTheme.background,
        appBar: AppBar(
          title: const Text('Mes parties'),
          bottom: const TabBar(
            indicatorColor: AppTheme.accent,
            tabs: [Tab(text: 'En cours'), Tab(text: 'Terminées')],
          ),
        ),
        body: const TabBarView(
          children: [_GameList(status: 'ONGOING'), _GameList(status: 'FINISHED')],
        ),
      ),
    );
  }
}

class _GameList extends ConsumerWidget {
  const _GameList({required this.status});
  final String status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final games = ref.watch(myGamesProvider(status));

    return RefreshIndicator(
      onRefresh: () => ref.refresh(myGamesProvider(status).future),
      child: games.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => _Message(
          text: 'Impossible de charger vos parties.',
          action: TextButton(
            onPressed: () => ref.invalidate(myGamesProvider(status)),
            child: const Text('Réessayer'),
          ),
        ),
        data: (items) => items.isEmpty
            ? _Message(
                text: status == 'ONGOING'
                    ? 'Aucune partie en cours.'
                    : 'Aucune partie terminée pour l\'instant.',
              )
            : ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: items.length,
                separatorBuilder: (_, __) => const Gap(8),
                itemBuilder: (context, i) => _GameTile(game: items[i]),
              ),
      ),
    );
  }
}

class _GameTile extends ConsumerWidget {
  const _GameTile({required this.game});
  final GameSummary game;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (String badge, Color badgeColor) = switch (game.outcome) {
      'win' => ('Victoire', const Color(0xFF3A9D5D)),
      'loss' => ('Défaite', const Color(0xFFCA3431)),
      'draw' => ('Nulle', const Color(0xFF9E9E9E)),
      _ => ('En cours', AppTheme.accent),
    };

    return Card(
      child: ListTile(
        onTap: () => _open(context, ref),
        leading: game.opponentName != null
            ? PlayerAvatar(displayName: game.opponentName!, avatarUrl: game.opponentAvatarUrl)
            : CircleAvatar(
                backgroundColor: AppTheme.primary,
                child: Icon(game.mode == 'AI' ? Icons.smart_toy_outlined : Icons.people_outline,
                    color: Colors.white),
              ),
        title: Text(game.opponentLabel,
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
        subtitle: Text(
          '${game.modeLabel} · ${game.timeControlLabel} · '
          '${game.color == 'white' ? 'Blancs' : 'Noirs'} · ${game.moveCount} demi-coups\n'
          '${_formatDate(game.createdAt)}',
          style: const TextStyle(color: Colors.white54, fontSize: 12),
        ),
        isThreeLine: true,
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: badgeColor.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(badge, style: TextStyle(color: badgeColor, fontWeight: FontWeight.w700)),
        ),
      ),
    );
  }

  /// Partie en cours → reprise ; terminée → lecteur / analyse.
  void _open(BuildContext context, WidgetRef ref) {
    final Widget screen;
    if (!game.isOngoing) {
      screen = GameReplayScreen(gameId: game.id, flipped: game.color == 'black');
    } else if (game.isOnline) {
      ref.read(multiplayerProvider.notifier).resumeGame(game.id);
      screen = const OnlineGameScreen();
    } else {
      ref.read(gameProvider.notifier).resumeGame(game.id);
      screen = const GameScreen();
    }
    Navigator.push(context, MaterialPageRoute<void>(builder: (_) => screen));
  }

  static String _formatDate(DateTime d) {
    final local = d.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)}/${local.year} à ${two(local.hour)} h ${two(local.minute)}';
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.text, this.action});
  final String text;
  final Widget? action;

  @override
  Widget build(BuildContext context) => ListView(
        // ListView : permet le « tirer pour rafraîchir » même quand la liste est vide
        children: [
          const Gap(80),
          Text(text, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white54)),
          if (action != null) Center(child: action),
        ],
      );
}
