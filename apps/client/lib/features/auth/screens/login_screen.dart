import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/oauth_buttons.dart';
import 'register_screen.dart';

/// Écran de connexion — e-mail + mot de passe, ou Google / Apple / Facebook (sprint 15).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.onSuccess});

  /// Callback appelé après une connexion réussie.
  final VoidCallback? onSuccess;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _loading  = false;
  bool _showPass = false;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Connexion')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Gap(16),
            const Text('♟', textAlign: TextAlign.center,
                style: TextStyle(fontSize: 56, color: Colors.white)),
            const Gap(8),
            const Text('Échecs Multiplateforme',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: Colors.white70,
                    fontSize: 15,
                    letterSpacing: 0.5)),
            const Gap(40),

            // ─── Champ e-mail ─────────────────────────────────────────────
            TextField(
              controller: _emailCtrl,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              style: const TextStyle(color: Colors.white),
              decoration: _inputDeco('E-mail', Icons.email_outlined),
            ),
            const Gap(16),

            // ─── Champ mot de passe ───────────────────────────────────────
            TextField(
              controller: _passwordCtrl,
              obscureText: !_showPass,
              style: const TextStyle(color: Colors.white),
              decoration: _inputDeco('Mot de passe', Icons.lock_outline).copyWith(
                suffixIcon: IconButton(
                  icon: Icon(_showPass ? Icons.visibility_off : Icons.visibility,
                      color: Colors.white54),
                  onPressed: () => setState(() => _showPass = !_showPass),
                ),
              ),
            ),

            // ─── Message d'erreur ─────────────────────────────────────────
            if (_error != null) ...[
              const Gap(12),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTheme.accent, fontSize: 13)),
            ],

            const Gap(28),

            // ─── Bouton connexion ─────────────────────────────────────────
            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Se connecter'),
            ),

            // ─── Connexion OAuth (sprint 15) ──────────────────────────────
            OAuthButtons(
              onSuccess: _onLoggedIn,
              onError: (message) => setState(() => _error = message),
            ),

            const Gap(20),

            // ─── Lien inscription ─────────────────────────────────────────
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('Pas encore de compte ?',
                    style: TextStyle(color: Colors.white54, fontSize: 13)),
                TextButton(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                        builder: (_) => RegisterScreen(onSuccess: widget.onSuccess)),
                  ),
                  child: const Text('Créer un compte'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  InputDecoration _inputDeco(String label, IconData icon) => InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.white54),
        prefixIcon: Icon(icon, color: Colors.white38),
        filled: true,
        fillColor: AppTheme.surface,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppTheme.accent),
        ),
      );

  Future<void> _submit() async {
    final email    = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Veuillez remplir tous les champs.');
      return;
    }

    setState(() { _loading = true; _error = null; });

    await ref.read(authProvider.notifier).login(
          email: email, password: password);

    if (!mounted) return;

    final auth = ref.read(authProvider);
    if (auth.hasError) {
      setState(() {
        _error   = 'Identifiants invalides. Vérifiez votre e-mail et mot de passe.';
        _loading = false;
      });
    } else if (auth.valueOrNull?.isLoggedIn ?? false) {
      _onLoggedIn();
    }
  }

  void _onLoggedIn() {
    widget.onSuccess?.call();
    Navigator.pop(context);
  }
}
