import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/notifications_provider.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state    = ref.watch(notificationsProvider);
    final notifier = ref.read(notificationsProvider.notifier);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: Text(
          state.unreadCount > 0
              ? 'Notifications (${state.unreadCount})'
              : 'Notifications',
        ),
        actions: [
          if (state.unreadCount > 0)
            TextButton(
              onPressed: notifier.markAllRead,
              child: const Text('Tout lire'),
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: notifier.load,
          ),
        ],
      ),
      body: state.isLoading
          ? const Center(child: CircularProgressIndicator())
          : state.items.isEmpty
              ? _buildEmpty()
              : ListView.separated(
                  itemCount:    state.items.length,
                  separatorBuilder: (_, __) =>
                      Divider(color: Colors.white.withValues(alpha: 0.06), height: 1),
                  itemBuilder: (ctx, i) {
                    final n = state.items[i];
                    return _NotificationTile(
                      item:     n,
                      onTap: () {
                        if (!n.isRead) notifier.markRead(n.id);
                      },
                    );
                  },
                ),
    );
  }

  Widget _buildEmpty() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text('🔔', style: TextStyle(fontSize: 48)),
          const Gap(16),
          const Text('Aucune notification',
              style: TextStyle(color: Colors.white70, fontSize: 16)),
          const Gap(8),
          Text('Elles apparaîtront ici au fil de vos parties.',
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.35), fontSize: 13)),
        ],
      ),
    );
  }
}

class _NotificationTile extends StatelessWidget {
  const _NotificationTile({required this.item, required this.onTap});

  final NotificationItem item;
  final VoidCallback     onTap;

  static const _icons = {
    'YOUR_TURN':   Icons.sports_esports,
    'GAME_ENDED':  Icons.flag,
    'GAME_INVITE': Icons.people,
    'SYSTEM':      Icons.info_outline,
  };

  static const _colors = {
    'YOUR_TURN':   Color(0xFF4CAF50),
    'GAME_ENDED':  Color(0xFF9E9E9E),
    'GAME_INVITE': Color(0xFF2196F3),
    'SYSTEM':      Color(0xFFFFC107),
  };

  String _title() {
    switch (item.type) {
      case 'YOUR_TURN':   return 'C\'est à vous de jouer';
      case 'GAME_ENDED':  return 'Partie terminée';
      case 'GAME_INVITE': return 'Invitation reçue';
      case 'SYSTEM':
        return item.payload['title'] as String? ?? 'Message système';
      default:
        return item.type;
    }
  }

  String _subtitle() {
    final msg = item.payload['message'] as String?;
    if (msg != null) return msg;
    switch (item.type) {
      case 'YOUR_TURN':
        return 'Votre adversaire a joué — c\'est votre tour.';
      case 'GAME_ENDED':
        final result = item.payload['result'] as String? ?? '';
        return switch (result) {
          'WHITE_WIN' => 'Victoire des blancs.',
          'BLACK_WIN' => 'Victoire des noirs.',
          'DRAW'      => 'Partie nulle.',
          _           => 'La partie est terminée.',
        };
      default:
        return '';
    }
  }

  String _timeAgo() {
    final diff = DateTime.now().difference(item.createdAt);
    if (diff.inMinutes < 1)  return 'À l\'instant';
    if (diff.inHours   < 1)  return 'Il y a ${diff.inMinutes} min';
    if (diff.inDays    < 1)  return 'Il y a ${diff.inHours} h';
    if (diff.inDays    < 7)  return 'Il y a ${diff.inDays} j';
    return item.createdAt.toLocal().toString().substring(0, 10);
  }

  @override
  Widget build(BuildContext context) {
    final color = _colors[item.type] ?? Colors.white54;
    final icon  = _icons[item.type]  ?? Icons.notifications_outlined;

    return InkWell(
      onTap: onTap,
      child: Container(
        color: item.isRead ? Colors.transparent : AppTheme.primary.withValues(alpha: 0.15),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const Gap(12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(_title(),
                            style: TextStyle(
                              color: Colors.white,
                              fontWeight: item.isRead
                                  ? FontWeight.w400
                                  : FontWeight.w600,
                              fontSize: 14,
                            )),
                      ),
                      if (!item.isRead)
                        Container(
                          width: 8, height: 8,
                          decoration: const BoxDecoration(
                            color: AppTheme.accent,
                            shape: BoxShape.circle,
                          ),
                        ),
                    ],
                  ),
                  const Gap(3),
                  Text(_subtitle(),
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.5),
                          fontSize: 12)),
                  const Gap(5),
                  Text(_timeAgo(),
                      style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.28),
                          fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
