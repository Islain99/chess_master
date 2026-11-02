// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Partie locale / IA à reprendre (carte « Reprendre » de l'accueil)
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/http/api_client.dart';
import '../../auth/providers/auth_provider.dart';
import '../services/resume_store.dart';

class ResumableGame {
  const ResumableGame({required this.id, required this.mode, required this.moveCount, this.aiLevel});

  final String id;
  final String mode; // LOCAL ou AI
  final int moveCount;
  final int? aiLevel;

  String get description => mode == 'AI'
      ? 'Contre l\'IA (niveau ${aiLevel ?? '?'}) · $moveCount demi-coups'
      : 'Partie locale · $moveCount demi-coups';
}

/// Vérifie auprès du serveur que la partie mémorisée est toujours en cours ;
/// sinon (terminée, supprimée) l'oublie.
final resumableGameProvider = FutureProvider.autoDispose<ResumableGame?>((ref) async {
  final id = await ResumeStore.read();
  if (id == null) return null;
  try {
    final data = await ref.read(apiClientProvider).getGame(id);
    if (data['status'] != 'ONGOING') {
      await ResumeStore.clear();
      return null;
    }
    return ResumableGame(
      id: id,
      mode: data['mode'] as String? ?? 'LOCAL',
      moveCount: (data['moves'] as List? ?? const []).length,
      aiLevel: data['aiLevel'] as int?,
    );
  } on ApiException catch (e) {
    if (e.statusCode == 404) await ResumeStore.clear();
    return null;
  } catch (_) {
    return null; // hors ligne : on réessaiera à la prochaine ouverture
  }
});
