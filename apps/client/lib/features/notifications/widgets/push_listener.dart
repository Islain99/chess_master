// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Réaction de l'interface aux notifications push
//
//   • premier plan : bannière (SnackBar) + rafraîchissement du badge ;
//   • notification touchée (appli en arrière-plan ou fermée) : ouverture de
//     l'écran Notifications.
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../auth/providers/auth_provider.dart';
import '../providers/notifications_provider.dart';
import '../screens/notifications_screen.dart';
import '../services/push_service.dart';

class PushListener extends ConsumerStatefulWidget {
  const PushListener({
    super.key,
    required this.child,
    required this.navigatorKey,
    required this.messengerKey,
  });

  final Widget child;
  final GlobalKey<NavigatorState> navigatorKey;
  final GlobalKey<ScaffoldMessengerState> messengerKey;

  @override
  ConsumerState<PushListener> createState() => _PushListenerState();
}

class _PushListenerState extends ConsumerState<PushListener> {
  final _subs = <StreamSubscription<PushEvent>>[];

  @override
  void initState() {
    super.initState();
    final push = ref.read(pushServiceProvider);
    if (!push.isAvailable) return;
    _subs
      ..add(push.foregroundMessages().listen(_onForeground))
      ..add(push.openedMessages().listen(_onOpened));
  }

  @override
  void dispose() {
    for (final sub in _subs) {
      sub.cancel();
    }
    super.dispose();
  }

  void _onForeground(PushEvent event) {
    ref.read(notificationsProvider.notifier).load();
    widget.messengerKey.currentState
      ?..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text(
            [event.title, event.body].whereType<String>().join(' — '),
          ),
          action: SnackBarAction(label: 'Voir', onPressed: _openNotifications),
        ),
      );
  }

  void _onOpened(PushEvent event) {
    ref.read(notificationsProvider.notifier).load();
    _openNotifications();
  }

  void _openNotifications() {
    widget.navigatorKey.currentState?.push(
      MaterialPageRoute<void>(builder: (_) => const NotificationsScreen()),
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
