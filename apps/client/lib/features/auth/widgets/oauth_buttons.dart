// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Boutons « Continuer avec Google / Apple / Facebook »
//
// Affiche uniquement les fournisseurs disponibles sur la plateforme courante
// et configurés (OAuthService.availableProviders). Sans aucune configuration,
// le widget ne rend rien : l'écran de connexion reste identique.
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';

import '../../../core/http/api_client.dart';
import '../providers/auth_provider.dart';
import '../services/oauth_service.dart';
import 'google_web_button.dart';

class OAuthButtons extends ConsumerStatefulWidget {
  const OAuthButtons({super.key, required this.onSuccess, required this.onError});

  /// Appelé une fois la session ouverte.
  final VoidCallback onSuccess;

  /// Message à afficher à l'utilisateur.
  final ValueChanged<String> onError;

  @override
  ConsumerState<OAuthButtons> createState() => _OAuthButtonsState();
}

class _OAuthButtonsState extends ConsumerState<OAuthButtons> {
  OAuthProvider? _pending;
  StreamSubscription<OAuthCredential>? _googleWebSub;

  OAuthService get _oauth => ref.read(oauthServiceProvider);

  @override
  void initState() {
    super.initState();
    // Web : le bouton Google officiel publie ses jetons sur un flux.
    if (_oauth.usesGoogleWebButton) {
      _googleWebSub = _oauth.googleWebCredentials().listen(
            _exchange,
            onError: (Object e) => widget.onError(_messageFor(e, OAuthProvider.google)),
          );
    }
  }

  @override
  void dispose() {
    _googleWebSub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final providers = _oauth.availableProviders;
    if (providers.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const _OrDivider(),
        for (final provider in providers) ...[
          if (provider == OAuthProvider.google && _oauth.usesGoogleWebButton)
            Center(child: buildGoogleWebButton())
          else
            _ProviderButton(
              provider: provider,
              loading: _pending == provider,
              onPressed: _pending == null ? () => _signIn(provider) : null,
            ),
          const Gap(12),
        ],
      ],
    );
  }

  // ─── Flux ──────────────────────────────────────────────────────────────────

  Future<void> _signIn(OAuthProvider provider) async {
    setState(() => _pending = provider);
    try {
      final credential = await _oauth.signIn(provider);
      if (credential == null) return; // annulé par l'utilisateur
      await _exchange(credential);
    } catch (e) {
      widget.onError(_messageFor(e, provider));
    } finally {
      if (mounted) setState(() => _pending = null);
    }
  }

  /// Envoie le jeton du fournisseur à l'API et ouvre la session.
  Future<void> _exchange(OAuthCredential credential) async {
    await ref.read(authProvider.notifier).loginWithOAuth(credential);
    if (!mounted) return;

    final auth = ref.read(authProvider);
    if (auth.hasError) {
      widget.onError(_messageFor(auth.error!, credential.provider));
    } else if (auth.valueOrNull?.isLoggedIn ?? false) {
      widget.onSuccess();
    }
  }

  String _messageFor(Object error, OAuthProvider provider) {
    if (error is OAuthException) return error.message;
    if (error is ApiException) {
      // 409 : e-mail déjà lié à un autre fournisseur — message serveur explicite.
      if (error.statusCode == 409) return error.message;
      if (error.statusCode == 503) return 'La connexion ${provider.label} est indisponible.';
      return 'Connexion ${provider.label} refusée. Réessayez.';
    }
    return 'Connexion ${provider.label} impossible. Vérifiez votre connexion réseau.';
  }
}

// ─── Widgets internes ────────────────────────────────────────────────────────

class _OrDivider extends StatelessWidget {
  const _OrDivider();

  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(vertical: 20),
      child: Row(
        children: [
          Expanded(child: Divider(color: Colors.white24)),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 12),
            child: Text('ou', style: TextStyle(color: Colors.white54, fontSize: 13)),
          ),
          Expanded(child: Divider(color: Colors.white24)),
        ],
      ),
    );
  }
}

/// Bouton aux couleurs du fournisseur (chartes Google, Apple et Meta).
class _ProviderButton extends StatelessWidget {
  const _ProviderButton({required this.provider, required this.loading, required this.onPressed});

  final OAuthProvider provider;
  final bool loading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg, Widget icon) = switch (provider) {
      OAuthProvider.google => (
          Colors.white,
          Colors.black87,
          const Text('G',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: Color(0xFF4285F4))),
        ),
      OAuthProvider.apple => (Colors.black, Colors.white, const Icon(Icons.apple, size: 22)),
      OAuthProvider.facebook => (const Color(0xFF1877F2), Colors.white, const Icon(Icons.facebook, size: 22)),
    };

    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: bg,
          foregroundColor: fg,
          disabledBackgroundColor: bg.withValues(alpha: 0.6),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          side: provider == OAuthProvider.apple ? const BorderSide(color: Colors.white24) : null,
        ),
        child: loading
            ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: fg))
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  icon,
                  const Gap(10),
                  Text('Continuer avec ${provider.label}',
                      style: const TextStyle(fontWeight: FontWeight.w600)),
                ],
              ),
      ),
    );
  }
}
