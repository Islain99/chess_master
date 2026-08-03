import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/auth_provider.dart';

/// Écran d'inscription — email, mot de passe, nom d'affichage.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key, this.onSuccess});

  final VoidCallback? onSuccess;

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _nameCtrl     = TextEditingController();
  final _emailCtrl    = TextEditingController();
  final _passwordCtrl = TextEditingController();
  final _confirmCtrl  = TextEditingController();
  bool _loading  = false;
  bool _showPass = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passwordCtrl.dispose();
    _confirmCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Créer un compte')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Gap(8),

            _field('Nom d\'affichage', Icons.person_outline, _nameCtrl),
            const Gap(14),
            _field('E-mail', Icons.email_outlined, _emailCtrl,
                type: TextInputType.emailAddress),
            const Gap(14),
            _field('Mot de passe', Icons.lock_outline, _passwordCtrl,
                obscure: !_showPass,
                suffix: IconButton(
                  icon: Icon(_showPass ? Icons.visibility_off : Icons.visibility,
                      color: Colors.white54),
                  onPressed: () => setState(() => _showPass = !_showPass),
                )),
            const Gap(14),
            _field('Confirmer le mot de passe', Icons.lock_outline, _confirmCtrl,
                obscure: !_showPass),

            if (_error != null) ...[
              const Gap(12),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppTheme.accent, fontSize: 13)),
            ],

            const Gap(28),

            ElevatedButton(
              onPressed: _loading ? null : _submit,
              child: _loading
                  ? const SizedBox(
                      width: 20, height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Text('Créer mon compte'),
            ),

            const Gap(16),
            Text(
              'En créant un compte, vous acceptez d\'utiliser cette\napplication à des fins de test et d\'apprentissage.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(
    String label,
    IconData icon,
    TextEditingController ctrl, {
    TextInputType type = TextInputType.text,
    bool obscure = false,
    Widget? suffix,
  }) {
    return TextField(
      controller: ctrl,
      keyboardType: type,
      obscureText: obscure,
      autocorrect: false,
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        labelText: label,
        labelStyle: const TextStyle(color: Colors.white54),
        prefixIcon: Icon(icon, color: Colors.white38),
        suffixIcon: suffix,
        filled: true,
        fillColor: AppTheme.surface,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.white.withOpacity(0.1)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppTheme.accent),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    final name     = _nameCtrl.text.trim();
    final email    = _emailCtrl.text.trim();
    final password = _passwordCtrl.text;
    final confirm  = _confirmCtrl.text;

    if (name.isEmpty || email.isEmpty || password.isEmpty) {
      setState(() => _error = 'Tous les champs sont obligatoires.');
      return;
    }
    if (password.length < 8) {
      setState(() => _error = 'Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    if (password != confirm) {
      setState(() => _error = 'Les mots de passe ne correspondent pas.');
      return;
    }

    setState(() { _loading = true; _error = null; });

    await ref.read(authProvider.notifier).register(
          email: email, password: password, displayName: name);

    if (!mounted) return;

    final auth = ref.read(authProvider);
    if (auth.hasError) {
      setState(() {
        _error   = 'Inscription échouée. Cet e-mail est peut-être déjà utilisé.';
        _loading = false;
      });
    } else if (auth.valueOrNull?.isLoggedIn ?? false) {
      widget.onSuccess?.call();
      Navigator.popUntil(context, (r) => r.isFirst);
    }
  }
}
