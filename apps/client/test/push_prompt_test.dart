// ─────────────────────────────────────────────────────────────────────────────
// Novembre 2026 — Carte d'activation des notifications (iPhone compris)
// ─────────────────────────────────────────────────────────────────────────────
import 'package:chess_client/features/notifications/services/push_service.dart';
import 'package:chess_client/features/notifications/widgets/push_prompt_card.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  PushPrompt prompt(PushPermission p, {bool web = true, TargetPlatform os = TargetPlatform.iOS, bool loggedIn = true}) =>
      pushPromptFor(p, isWeb: web, platform: os, loggedIn: loggedIn);

  test('iPhone dans Safari (pas de Push API) : instructions d\'installation, même déconnecté', () {
    expect(prompt(PushPermission.unsupported), PushPrompt.installOnIphone);
    expect(prompt(PushPermission.unsupported, loggedIn: false), PushPrompt.installOnIphone);
  });

  test('navigateur sans push hors iPhone : rien à proposer', () {
    expect(prompt(PushPermission.unsupported, os: TargetPlatform.android), PushPrompt.none);
    expect(prompt(PushPermission.unsupported, web: false), PushPrompt.none);
  });

  test('jamais demandé : bouton Activer, seulement une fois connecté', () {
    expect(prompt(PushPermission.notDetermined), PushPrompt.enable);
    expect(prompt(PushPermission.notDetermined, os: TargetPlatform.windows), PushPrompt.enable);
    expect(prompt(PushPermission.notDetermined, loggedIn: false), PushPrompt.none);
  });

  test('refusé : explication ; accordé ou non configuré : rien', () {
    expect(prompt(PushPermission.denied), PushPrompt.blocked);
    expect(prompt(PushPermission.granted), PushPrompt.none);
    expect(prompt(PushPermission.unavailable), PushPrompt.none);
  });

  test('Firebase non configuré : état « unavailable » sans appeler Firebase', () async {
    final push = PushService(platform: TargetPlatform.iOS, isWeb: true, configured: false);
    expect(await push.permission(), PushPermission.unavailable);
  });
}
