// ─────────────────────────────────────────────────────────────────────────────
// Polissage — Ouvrir la partie liée à une notification
//
// Avant, toucher une notification (dans l'application ou une notification
// push) ouvrait seulement la liste des notifications. Désormais :
//   • partie en ligne en cours  → écran de partie en ligne (reprise) ;
//   • partie locale / IA en cours → écran de partie (reprise) ;
//   • partie terminée           → lecteur / analyse, du point de vue du joueur.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/http/api_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../../game/providers/game_provider.dart';
import '../../game/screens/game_screen.dart';
import '../../multiplayer/providers/multiplayer_provider.dart';
import '../../multiplayer/screens/online_game_screen.dart';
import '../../replay/screens/game_replay_screen.dart';

/// Écran à ouvrir pour une partie, d'après sa réponse `GET /games/:id`.
/// Exposé pour les tests : ne fait aucun appel réseau.
enum GameDestination { online, local, replay }

GameDestination destinationFor(Map<String, dynamic> game) {
  final status = game['status'] as String?;
  final mode = game['mode'] as String?;
  final ongoing = status == 'ONGOING' || status == 'WAITING';
  if (!ongoing) return GameDestination.replay;
  return mode == 'PRIVATE' || mode == 'MATCHMAKING'
      ? GameDestination.online
      : GameDestination.local;
}

/// Ouvre la partie [gameId] dans [navigator].
/// Renvoie false si la partie est introuvable ou le serveur injoignable.
Future<bool> openGame(NavigatorState navigator, WidgetRef ref, String gameId) async {
  final Map<String, dynamic> game;
  try {
    game = await ref.read(apiClientProvider).getGame(gameId);
  } on ApiException {
    return false;
  } catch (_) {
    return false; // hors ligne
  }

  final Widget screen;
  switch (destinationFor(game)) {
    case GameDestination.online:
      ref.read(multiplayerProvider.notifier).resumeGame(gameId);
      screen = const OnlineGameScreen();
    case GameDestination.local:
      await ref.read(gameProvider.notifier).resumeGame(gameId);
      screen = const GameScreen();
    case GameDestination.replay:
      final userId = ref.read(authProvider).valueOrNull?.user?.id;
      final flipped = userId != null && game['blackPlayerId'] == userId;
      screen = GameReplayScreen(gameId: gameId, flipped: flipped);
  }
  if (!navigator.mounted) return false;
  await navigator.push(MaterialPageRoute<void>(builder: (_) => screen));
  return true;
}
