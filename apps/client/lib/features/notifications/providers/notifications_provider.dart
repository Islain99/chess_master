import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/http/api_client.dart';
import '../../auth/providers/auth_provider.dart';

class NotificationItem {
  const NotificationItem({
    required this.id,
    required this.type,
    required this.payload,
    required this.isRead,
    required this.createdAt,
  });

  final String   id;
  final String   type;
  final Map<String, dynamic> payload;
  final bool     isRead;
  final DateTime createdAt;

  factory NotificationItem.fromJson(Map<String, dynamic> j) =>
      NotificationItem(
        id:        j['id'] as String,
        type:      j['type'] as String,
        payload:   (j['payload'] as Map?)?.cast<String, dynamic>() ?? {},
        isRead:    j['isRead'] as bool? ?? false,
        createdAt: DateTime.parse(j['createdAt'] as String),
      );

  NotificationItem copyWith({bool? isRead}) => NotificationItem(
        id: id, type: type, payload: payload, createdAt: createdAt,
        isRead: isRead ?? this.isRead,
      );
}

class NotificationsState {
  const NotificationsState({
    this.items       = const [],
    this.total       = 0,
    this.unreadCount = 0,
    this.isLoading   = false,
  });
  final List<NotificationItem> items;
  final int  total;
  final int  unreadCount;
  final bool isLoading;

  NotificationsState copyWith({
    List<NotificationItem>? items, int? total,
    int? unreadCount, bool? isLoading,
  }) => NotificationsState(
    items:       items       ?? this.items,
    total:       total       ?? this.total,
    unreadCount: unreadCount ?? this.unreadCount,
    isLoading:   isLoading   ?? this.isLoading,
  );
}

final notificationsProvider =
    StateNotifierProvider<NotificationsNotifier, NotificationsState>((ref) {
  // Sprint 16 : watch (et non read) → le notifier est recréé à la connexion /
  // déconnexion, au lieu de garder un client API sans jeton.
  final client = ref.watch(apiClientProvider);
  return NotificationsNotifier(client);
});

class NotificationsNotifier extends StateNotifier<NotificationsState> {
  NotificationsNotifier(this._api) : super(const NotificationsState()) {
    load();
  }

  final ApiClient _api;

  Future<void> load() async {
    state = state.copyWith(isLoading: true);
    try {
      final [list, countData] = await Future.wait([
        _api.get('/notifications?pageSize=30'),
        _api.get('/notifications/unread-count'),
      ]);
      final items = (list['items'] as List? ?? [])
          .cast<Map<String, dynamic>>()
          .map(NotificationItem.fromJson)
          .toList();
      state = state.copyWith(
        items:       items,
        total:       list['total'] as int? ?? 0,
        unreadCount: countData['count'] as int? ?? 0,
        isLoading:   false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  Future<void> markRead(String id) async {
    try {
      // Sprint 16 : l'API expose PATCH (le POST d'origine renvoyait 404).
      await _api.patch('/notifications/$id/read');
      state = state.copyWith(
        items: state.items
            .map((n) => n.id == id ? n.copyWith(isRead: true) : n)
            .toList(),
        unreadCount: (state.unreadCount - 1).clamp(0, 9999),
      );
    } catch (_) {}
  }

  Future<void> markAllRead() async {
    try {
      await _api.patch('/notifications/read-all');
      state = state.copyWith(
        items: state.items.map((n) => n.copyWith(isRead: true)).toList(),
        unreadCount: 0,
      );
    } catch (_) {}
  }
}
