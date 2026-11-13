// ─────────────────────────────────────────────────────────────────────────────
// Novembre 2026 — Activation des notifications push (Web, iPhone compris)
//
// Safari sur iPhone n'autorise les notifications que :
//   1. pour un site ajouté à l'écran d'accueil (sinon : Push API absente) ;
//   2. en réponse directe à un geste de l'utilisateur (sinon : demande ignorée).
// La demande automatique faite à la connexion n'aboutit donc pas sur iPhone.
// Cette carte affiche, selon l'état :
//   • iPhone dans Safari  → comment ajouter Chess master à l'écran d'accueil ;
//   • jamais demandé      → bouton « Activer » (geste de l'utilisateur) ;
//   • refusé              → où réactiver les notifications ;
//   • actif / indisponible → rien.
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_theme.dart';
import '../../auth/providers/auth_provider.dart';
import '../services/push_service.dart';

/// État courant ; `ref.invalidate(pushPermissionProvider)` pour le relire.
final pushPermissionProvider = FutureProvider.autoDispose<PushPermission>(
  (ref) => ref.read(pushServiceProvider).permission(),
);

/// Ce que la carte doit montrer (logique pure, testée sans Firebase).
enum PushPrompt { none, installOnIphone, enable, blocked }

PushPrompt pushPromptFor(
  PushPermission permission, {
  required bool isWeb,
  required TargetPlatform platform,
  required bool loggedIn,
}) {
  final iphoneWeb = isWeb && platform == TargetPlatform.iOS;
  return switch (permission) {
    PushPermission.unsupported when iphoneWeb => PushPrompt.installOnIphone,
    PushPermission.notDetermined when loggedIn => PushPrompt.enable,
    PushPermission.denied when loggedIn => PushPrompt.blocked,
    _ => PushPrompt.none,
  };
}

class PushPromptCard extends ConsumerStatefulWidget {
  const PushPromptCard({super.key, this.dismissible = false});

  /// Accueil : la carte peut être masquée pour la session.
  final bool dismissible;

  @override
  ConsumerState<PushPromptCard> createState() => _PushPromptCardState();
}

class _PushPromptCardState extends ConsumerState<PushPromptCard> {
  static bool _dismissedThisSession = false;
  bool _busy = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    if (widget.dismissible && _dismissedThisSession) return const SizedBox.shrink();
    final permission = ref.watch(pushPermissionProvider).valueOrNull;
    if (permission == null) return const SizedBox.shrink();

    final loggedIn = ref.watch(authProvider).valueOrNull?.isLoggedIn ?? false;
    final prompt = pushPromptFor(
      permission,
      isWeb: kIsWeb,
      platform: defaultTargetPlatform,
      loggedIn: loggedIn,
    );

    return switch (prompt) {
      PushPrompt.none => const SizedBox.shrink(),
      PushPrompt.installOnIphone => _card(
          icon: Icons.ios_share,
          title: 'Installer Chess master sur votre iPhone',
          text: 'Dans Safari, touchez Partager, puis « Sur l\'écran d\'accueil ». '
              'Ouvrez ensuite Chess master depuis son icône : l\'application s\'affiche '
              'en plein écran et peut recevoir des notifications.',
        ),
      PushPrompt.enable => _card(
          icon: Icons.notifications_active_outlined,
          title: 'Être prévenu quand c\'est votre tour',
          text: 'Recevez une notification quand un adversaire joue ou qu\'une partie se termine.',
          action: FilledButton(
            onPressed: _busy ? null : _enable,
            child: _busy
                ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Activer'),
          ),
        ),
      PushPrompt.blocked => _card(
          icon: Icons.notifications_off_outlined,
          title: 'Notifications bloquées',
          text: defaultTargetPlatform == TargetPlatform.iOS
              ? 'Pour les réactiver : Réglages de l\'iPhone > Notifications > Chess master.'
              : 'Pour les réactiver, autorisez les notifications pour ce site dans les '
                  'réglages du navigateur (icône à gauche de l\'adresse).',
        ),
    };
  }

  /// Appelé DIRECTEMENT par le bouton : la demande d'autorisation part du
  /// geste de l'utilisateur, condition imposée par Safari sur iPhone.
  Future<void> _enable() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await ref.read(pushServiceProvider).register(ref.read(apiClientProvider));
    if (!mounted) return;
    setState(() {
      _busy = false;
      if (!ok) _error = 'Activation impossible. Réessayez, ou vérifiez les réglages de notification.';
    });
    ref.invalidate(pushPermissionProvider);
  }

  Widget _card({required IconData icon, required String title, required String text, Widget? action}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Card(
        color: AppTheme.primary.withValues(alpha: 0.6),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 8, 14),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, color: AppTheme.accent, size: 26),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(text, style: const TextStyle(color: Colors.white70, fontSize: 13, height: 1.35)),
                if (_error != null) ...[
                  const SizedBox(height: 6),
                  Text(_error!, style: const TextStyle(color: Color(0xFFFF8A80), fontSize: 13)),
                ],
                if (action != null) ...[
                  const SizedBox(height: 10),
                  action,
                ],
              ]),
            ),
            if (widget.dismissible)
              IconButton(
                tooltip: 'Masquer',
                icon: const Icon(Icons.close, color: Colors.white54, size: 18),
                onPressed: () => setState(() => _dismissedThisSession = true),
              ),
          ]),
        ),
      ),
    );
  }
}
