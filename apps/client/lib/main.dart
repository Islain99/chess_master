import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'core/theme/app_theme.dart';
import 'features/home/screens/home_screen.dart';
import 'features/notifications/widgets/push_listener.dart';

void main() {
  runApp(
    const ProviderScope(
      child: ChessApp(),
    ),
  );
}

class ChessApp extends StatelessWidget {
  const ChessApp({super.key});

  // Sprint 16 : clés globales pour réagir aux notifications push hors contexte
  // (bannière au premier plan, navigation au toucher).
  static final navigatorKey = GlobalKey<NavigatorState>();
  static final messengerKey = GlobalKey<ScaffoldMessengerState>();

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Échecs',
      navigatorKey: navigatorKey,
      scaffoldMessengerKey: messengerKey,
      builder: (context, child) => PushListener(
        navigatorKey: navigatorKey,
        messengerKey: messengerKey,
        child: child ?? const SizedBox.shrink(),
      ),
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      home: const HomeScreen(),
    );
  }
}
