// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Profil : avatar, nom, pays, statistiques et Elo par cadence
// ─────────────────────────────────────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';

import '../../../core/http/api_client.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/player_avatar.dart';
import '../../auth/models/auth_state.dart';
import '../../auth/providers/auth_provider.dart';
import '../../history/screens/my_games_screen.dart';

/// Statistiques et classements du joueur connecté.
final profileStatsProvider = FutureProvider.autoDispose<ProfileStats>((ref) async {
  final user = ref.watch(authProvider).valueOrNull?.user;
  if (user == null) return const ProfileStats();
  final api = ref.watch(apiClientProvider);
  final results = await Future.wait([
    api.get('/users/${user.id}/statistics'),
    api.getList('/users/${user.id}/ratings'),
  ]);
  return ProfileStats.fromJson(
    results[0] as Map<String, dynamic>,
    (results[1] as List).cast<Map<String, dynamic>>(),
  );
});

class ProfileStats {
  const ProfileStats({
    this.totalGames = 0,
    this.wins = 0,
    this.losses = 0,
    this.draws = 0,
    this.bestWinStreak = 0,
    this.ratings = const {},
  });

  final int totalGames, wins, losses, draws, bestWinStreak;

  /// Cadence (BULLET, BLITZ…) → Elo.
  final Map<String, int> ratings;

  factory ProfileStats.fromJson(Map<String, dynamic> stats, List<Map<String, dynamic>> ratings) {
    int n(String k) => (stats[k] as num?)?.toInt() ?? 0;
    return ProfileStats(
      totalGames: n('totalGames'),
      wins: n('totalWins'),
      losses: n('totalLosses'),
      draws: n('totalDraws'),
      bestWinStreak: n('bestWinStreak'),
      ratings: {
        for (final r in ratings)
          if (r['timeControl'] is String) r['timeControl'] as String: (r['elo'] as num?)?.toInt() ?? 1200,
      },
    );
  }

  /// Taux de victoire en % (0 si aucune partie).
  int get winRate => totalGames == 0 ? 0 : (wins * 100 / totalGames).round();
}

/// Pays proposés (code ISO 3166-1, validé par l'API).
const _countries = <String, String>{
  'CA': 'Canada', 'FR': 'France', 'BE': 'Belgique', 'CH': 'Suisse', 'LU': 'Luxembourg',
  'US': 'États-Unis', 'MA': 'Maroc', 'DZ': 'Algérie', 'TN': 'Tunisie', 'SN': 'Sénégal',
  'CI': 'Côte d\'Ivoire', 'CM': 'Cameroun', 'CD': 'RD Congo', 'HT': 'Haïti', 'LB': 'Liban',
  'MG': 'Madagascar', 'GB': 'Royaume-Uni', 'DE': 'Allemagne', 'ES': 'Espagne',
  'IT': 'Italie', 'PT': 'Portugal', 'BR': 'Brésil', 'MX': 'Mexique', 'IN': 'Inde',
  'CN': 'Chine', 'JP': 'Japon',
};

/// Drapeau emoji à partir du code pays (indicateurs régionaux Unicode).
String flagOf(String code) => String.fromCharCodes(
      code.toUpperCase().codeUnits.map((c) => 0x1F1E6 + c - 0x41),
    );

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  late final TextEditingController _name;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController(text: ref.read(authProvider).valueOrNull?.user?.displayName ?? '');
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save({String? avatar, bool clearAvatar = false, String? country, bool clearCountry = false, bool name = false}) async {
    setState(() => _saving = true);
    try {
      await ref.read(authProvider.notifier).updateProfile(
            displayName: name ? _name.text.trim() : null,
            avatarUrl: avatar,
            clearAvatar: clearAvatar,
            country: country,
            clearCountry: clearCountry,
          );
      _toast('Profil mis à jour.');
    } on ApiException catch (e) {
      _toast(e.message, error: true);
    } catch (_) {
      _toast('Enregistrement impossible. Vérifiez votre connexion.', error: true);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  void _toast(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: error ? Colors.red.shade700 : null,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).valueOrNull?.user;
    if (user == null) {
      return const Scaffold(body: Center(child: Text('Connectez-vous pour voir votre profil.')));
    }
    final stats = ref.watch(profileStatsProvider);

    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(title: const Text('Mon profil')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          // ─── Avatar ─────────────────────────────────────────────────────
          Center(
            child: Stack(children: [
              PlayerAvatar(displayName: user.displayName, avatarUrl: user.avatarUrl, radius: 48),
              Positioned(
                right: 0,
                bottom: 0,
                child: Material(
                  color: AppTheme.accent,
                  shape: const CircleBorder(),
                  child: IconButton(
                    tooltip: 'Changer d\'avatar',
                    icon: const Icon(Icons.edit, size: 18, color: Colors.white),
                    onPressed: _saving ? null : () => _pickAvatar(user),
                  ),
                ),
              ),
            ]),
          ),
          const Gap(8),
          Text(user.email, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white54)),
          const Gap(24),

          // ─── Nom ────────────────────────────────────────────────────────
          TextField(
            controller: _name,
            maxLength: 32,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Nom d\'affichage',
              suffixIcon: IconButton(
                tooltip: 'Enregistrer le nom',
                icon: const Icon(Icons.check),
                onPressed: _saving || _name.text.trim() == user.displayName ? null : () => _save(name: true),
              ),
            ),
            onChanged: (_) => setState(() {}),
            onSubmitted: (_) => _save(name: true),
          ),
          const Gap(8),

          // ─── Pays ───────────────────────────────────────────────────────
          DropdownButtonFormField<String>(
            initialValue: _countries.containsKey(user.country) ? user.country : '',
            dropdownColor: AppTheme.surface,
            style: const TextStyle(color: Colors.white),
            decoration: const InputDecoration(labelText: 'Pays'),
            items: [
              const DropdownMenuItem(value: '', child: Text('Non précisé')),
              for (final e in _countries.entries)
                DropdownMenuItem(value: e.key, child: Text('${flagOf(e.key)}  ${e.value}')),
            ],
            onChanged: _saving
                ? null
                : (code) => code == null || code.isEmpty ? _save(clearCountry: true) : _save(country: code),
          ),
          const Gap(28),

          // ─── Statistiques ───────────────────────────────────────────────
          const _SectionTitle('Statistiques'),
          stats.when(
            loading: () => const Padding(
              padding: EdgeInsets.all(16),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (_, __) => const Text('Statistiques indisponibles.', style: TextStyle(color: Colors.white54)),
            data: (s) => Column(children: [
              Row(children: [
                _StatTile(label: 'Parties', value: '${s.totalGames}'),
                _StatTile(label: 'Victoires', value: '${s.wins}'),
                _StatTile(label: 'Nulles', value: '${s.draws}'),
                _StatTile(label: 'Défaites', value: '${s.losses}'),
              ]),
              const Gap(8),
              Row(children: [
                _StatTile(label: 'Taux de victoire', value: '${s.winRate} %'),
                _StatTile(label: 'Meilleure série', value: '${s.bestWinStreak}'),
              ]),
              const Gap(16),
              const _SectionTitle('Classement Elo'),
              Row(children: [
                for (final tc in const ['BULLET', 'BLITZ', 'RAPID', 'CLASSICAL'])
                  _StatTile(label: _tcLabel(tc), value: s.ratings[tc]?.toString() ?? '—'),
              ]),
            ]),
          ),
          const Gap(24),
          OutlinedButton.icon(
            icon: const Icon(Icons.history),
            label: const Text('Mes parties'),
            onPressed: () => Navigator.push(
              context,
              MaterialPageRoute<void>(builder: (_) => const MyGamesScreen()),
            ),
          ),
          const Gap(8),
          OutlinedButton.icon(
            icon: const Icon(Icons.logout),
            label: const Text('Se déconnecter'),
            style: OutlinedButton.styleFrom(foregroundColor: AppTheme.accent),
            onPressed: () async {
              Navigator.pop(context);
              await ref.read(authProvider.notifier).logout();
            },
          ),
          const Gap(28),
          // Novembre 2026 : suppression de compte (RGPD, Loi 25).
          TextButton.icon(
            icon: const Icon(Icons.delete_forever_outlined),
            label: const Text('Supprimer mon compte'),
            style: TextButton.styleFrom(foregroundColor: const Color(0xFFCA3431)),
            onPressed: () async {
              final deleted = await showDialog<bool>(
                context: context,
                builder: (_) => DeleteAccountDialog(hasPassword: user.hasPassword),
              );
              if (deleted == true && context.mounted) {
                final messenger = ScaffoldMessenger.of(context);
                Navigator.pop(context);
                messenger.showSnackBar(
                  const SnackBar(content: Text('Votre compte a été supprimé.')),
                );
              }
            },
          ),
        ],
      ),
    );
  }

  static String _tcLabel(String tc) => switch (tc) {
        'BULLET' => 'Bullet',
        'BLITZ' => 'Blitz',
        'RAPID' => 'Rapide',
        _ => 'Classique',
      };

  Future<void> _pickAvatar(AuthUser user) async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: AppTheme.surface,
      builder: (_) => AvatarPicker(displayName: user.displayName, current: user.avatarUrl),
    );
    if (choice == null) return;
    if (choice == AvatarPicker.initialsChoice) {
      await _save(clearAvatar: true);
    } else {
      await _save(avatar: choice);
    }
  }
}

/// Grille des 36 avatars prédéfinis + option « initiales ».
class AvatarPicker extends StatelessWidget {
  const AvatarPicker({super.key, required this.displayName, this.current});

  final String displayName;
  final String? current;

  /// Valeur renvoyée pour revenir à l'avatar par initiales.
  static const initialsChoice = '__initials__';

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Choisir un avatar', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
          const Gap(12),
          Flexible(
            child: GridView.count(
              crossAxisCount: 6,
              shrinkWrap: true,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              children: [
                _choice(context, initialsChoice, PlayerAvatar(displayName: displayName), selected: current == null),
                for (final p in AvatarPreset.all)
                  _choice(context, p.value, PlayerAvatar(displayName: displayName, avatarUrl: p.value),
                      selected: current == p.value),
              ],
            ),
          ),
        ]),
      ),
    );
  }

  Widget _choice(BuildContext context, String value, Widget avatar, {required bool selected}) => InkWell(
        customBorder: const CircleBorder(),
        onTap: () => Navigator.pop(context, value),
        child: Container(
          padding: const EdgeInsets.all(2),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: selected ? AppTheme.accent : Colors.transparent, width: 2),
          ),
          child: avatar,
        ),
      );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text,
            style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
      );
}

class _StatTile extends StatelessWidget {
  const _StatTile({required this.label, required this.value});
  final String label, value;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 3),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(color: AppTheme.surface, borderRadius: BorderRadius.circular(10)),
          child: Column(children: [
            Text(value, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w700)),
            const Gap(2),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(color: Colors.white54, fontSize: 11)),
          ]),
        ),
      );
}

/// Confirmation de suppression : taper SUPPRIMER (+ mot de passe si le compte
/// en a un). Renvoie true une fois le compte supprimé.
class DeleteAccountDialog extends ConsumerStatefulWidget {
  const DeleteAccountDialog({super.key, required this.hasPassword});
  final bool hasPassword;

  @override
  ConsumerState<DeleteAccountDialog> createState() => _DeleteAccountDialogState();
}

class _DeleteAccountDialogState extends ConsumerState<DeleteAccountDialog> {
  final _confirm = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  bool get _canSubmit =>
      !_busy &&
      _confirm.text.trim().toUpperCase() == 'SUPPRIMER' &&
      (!widget.hasPassword || _password.text.isNotEmpty);

  @override
  void dispose() {
    _confirm.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authProvider.notifier).deleteAccount(
            password: widget.hasPassword ? _password.text : null,
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      setState(() {
        _busy = false;
        _error = e.message;
      });
    } catch (_) {
      setState(() {
        _busy = false;
        _error = 'Serveur injoignable. Réessayez plus tard.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppTheme.surface,
      title: const Text('Supprimer mon compte', style: TextStyle(color: Colors.white)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Votre profil, vos classements, vos statistiques et vos notifications '
              'seront effacés définitivement. Vos parties terminées resteront dans '
              'l\'historique de vos adversaires, sous « Compte supprimé ». '
              'Vos parties en ligne en cours seront annulées.',
              style: TextStyle(color: Colors.white70, height: 1.4),
            ),
            const Gap(16),
            if (widget.hasPassword) ...[
              TextField(
                controller: _password,
                obscureText: true,
                enabled: !_busy,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(labelText: 'Mot de passe'),
              ),
              const Gap(12),
            ],
            TextField(
              key: const ValueKey('delete-confirm'),
              controller: _confirm,
              enabled: !_busy,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(labelText: 'Tapez SUPPRIMER pour confirmer'),
            ),
            if (_error != null) ...[
              const Gap(12),
              Text(_error!, style: const TextStyle(color: Color(0xFFCA3431))),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context, false),
          child: const Text('Annuler'),
        ),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: const Color(0xFFCA3431)),
          onPressed: _canSubmit ? _submit : null,
          child: _busy
              ? const SizedBox.square(dimension: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Supprimer définitivement'),
        ),
      ],
    );
  }
}
