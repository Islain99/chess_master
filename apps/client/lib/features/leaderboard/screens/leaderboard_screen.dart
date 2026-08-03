import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/http/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../auth/providers/auth_provider.dart';

final leaderboardProvider =
    FutureProvider.family<Map<String, dynamic>, String>((ref, tc) async {
  final client = ref.read(apiClientProvider);
  return client.get('/leaderboard?timeControl=$tc&pageSize=50');
});

class LeaderboardScreen extends ConsumerStatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  ConsumerState<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends ConsumerState<LeaderboardScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;

  static const _tcs = [
    ('RAPID',     '⏱ Rapide'),
    ('BLITZ',     '🔥 Blitz'),
    ('BULLET',    '⚡ Bullet'),
    ('CLASSICAL', '🕰 Classique'),
  ];

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: _tcs.length, vsync: this);
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final myId = ref.read(authProvider).valueOrNull?.user?.id;

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Classement'),
        bottom: TabBar(
          controller: _tabs,
          isScrollable: true,
          tabs: _tcs.map((c) => Tab(text: c.$2)).toList(),
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: _tcs.map((c) {
          final data = ref.watch(leaderboardProvider(c.$1));
          return data.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
                child: Text('Erreur : $e',
                    style: const TextStyle(color: AppTheme.accent))),
            data: (json) {
              final items = (json['items'] as List? ?? [])
                  .cast<Map<String, dynamic>>();
              return ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: items.length,
                itemBuilder: (ctx, i) {
                  final p = items[i];
                  final isMe = p['userId'] == myId;
                  return _LeaderboardRow(
                    rank: p['rank'] as int,
                    displayName: p['displayName'] as String,
                    elo: p['elo'] as int,
                    gamesPlayed: p['gamesPlayed'] as int,
                    winRate: p['winRate'] as int,
                    isMe: isMe,
                  );
                },
              );
            },
          );
        }).toList(),
      ),
    );
  }
}

class _LeaderboardRow extends StatelessWidget {
  const _LeaderboardRow({
    required this.rank,
    required this.displayName,
    required this.elo,
    required this.gamesPlayed,
    required this.winRate,
    required this.isMe,
  });

  final int     rank;
  final String  displayName;
  final int     elo;
  final int     gamesPlayed;
  final int     winRate;
  final bool    isMe;

  @override
  Widget build(BuildContext context) {
    final medal = rank == 1 ? '🥇' : rank == 2 ? '🥈' : rank == 3 ? '🥉' : null;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 3),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isMe ? AppTheme.primary.withOpacity(0.4) : AppTheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: isMe
            ? Border.all(color: AppTheme.accent.withOpacity(0.6))
            : null,
      ),
      child: Row(
        children: [
          SizedBox(
            width: 40,
            child: medal != null
                ? Text(medal, style: const TextStyle(fontSize: 20))
                : Text('#$rank',
                    style: TextStyle(
                        color: Colors.white.withOpacity(0.4), fontSize: 13)),
          ),
          CircleAvatar(
            radius: 18,
            backgroundColor: isMe ? AppTheme.accent : AppTheme.primary,
            child: Text(displayName[0].toUpperCase(),
                style: const TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w700)),
          ),
          const Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(displayName,
                    style: TextStyle(
                        color: Colors.white,
                        fontWeight: isMe ? FontWeight.w700 : FontWeight.w500,
                        fontSize: 14)),
                Text('$gamesPlayed parties · $winRate% victoires',
                    style: TextStyle(
                        color: Colors.white.withOpacity(0.4), fontSize: 11)),
              ],
            ),
          ),
          Text('$elo',
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w700,
                  fontSize: 18)),
        ],
      ),
    );
  }
}
