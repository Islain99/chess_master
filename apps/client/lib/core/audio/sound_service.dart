// ─────────────────────────────────────────────────────────────────────────────
// Polissage — Effets sonores (réglage « Effets sonores »)
//
// Le réglage était enregistré mais aucun son n'existait. Trois sons courts,
// synthétisés pour le projet (aucun droit tiers) : coup, prise, échec.
// Joués par le plateau à chaque nouveau coup, et à l'arrivée d'une
// notification quand l'application est au premier plan.
//
// Les lecteurs ne sont créés qu'au premier son : tant que le réglage reste
// désactivé (valeur par défaut, et dans les tests), aucun plugin n'est appelé.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/board/models/chess_move.dart';
import '../settings/settings_provider.dart';

enum GameSound {
  move('sounds/move.wav'),
  capture('sounds/capture.wav'),
  check('sounds/check.wav');

  const GameSound(this.asset);

  /// Chemin relatif à `assets/` (préfixe par défaut d'audioplayers).
  final String asset;

  /// Son à jouer pour un coup : échec > prise > coup simple.
  static GameSound forMove(ChessMove move) {
    if (move.isCheck || move.isCheckmate) return GameSound.check;
    if (move.isCapture) return GameSound.capture;
    return GameSound.move;
  }
}

class SoundService {
  SoundService(this._enabled);

  final bool Function() _enabled;
  final _players = <GameSound, AudioPlayer>{};

  Future<void> play(GameSound sound) async {
    if (!_enabled()) return;
    try {
      final player = _players.putIfAbsent(sound, AudioPlayer.new);
      await player.stop();
      await player.play(AssetSource(sound.asset));
    } catch (_) {
      // Son indisponible (navigateur qui bloque la lecture automatique,
      // plateforme sans sortie audio…) : jamais bloquant pour la partie.
    }
  }

  Future<void> dispose() async {
    for (final player in _players.values) {
      await player.dispose();
    }
    _players.clear();
  }
}

final soundServiceProvider = Provider<SoundService>((ref) {
  final service = SoundService(() => ref.read(settingsProvider).soundEnabled);
  ref.onDispose(service.dispose);
  return service;
});
