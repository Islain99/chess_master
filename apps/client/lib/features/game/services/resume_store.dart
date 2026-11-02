// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Mémorise la dernière partie locale / contre l'IA de l'appareil
//
// Ces parties sont anonymes côté serveur (aucun compte associé) : sans cette
// mémoire, fermer l'application faisait perdre la partie en cours.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:shared_preferences/shared_preferences.dart';

class ResumeStore {
  ResumeStore._();

  static const _key = 'resume_game_id';

  static Future<String?> read() async =>
      (await SharedPreferences.getInstance()).getString(_key);

  static Future<void> save(String? gameId) async {
    final prefs = await SharedPreferences.getInstance();
    if (gameId == null) {
      await prefs.remove(_key);
    } else {
      await prefs.setString(_key, gameId);
    }
  }

  static Future<void> clear() => save(null);
}
