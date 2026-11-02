import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/multiplayer_provider.dart';
import 'online_game_screen.dart';

/// Écran de lobby multijoueur — créer ou rejoindre une salle privée.
class LobbyScreen extends ConsumerStatefulWidget {
  const LobbyScreen({super.key});

  @override
  ConsumerState<LobbyScreen> createState() => _LobbyScreenState();
}

class _LobbyScreenState extends ConsumerState<LobbyScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  final _codeCtrl = TextEditingController();
  bool _loading = false;
  String? _createdCode;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabs.dispose();
    _codeCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Multijoueur'),
        bottom: TabBar(
          controller: _tabs,
          tabs: const [
            Tab(text: 'Créer une salle'),
            Tab(text: 'Rejoindre'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [_buildCreateTab(), _buildJoinTab()],
      ),
    );
  }

  // ─── Onglet : créer ───────────────────────────────────────────────────────

  Widget _buildCreateTab() {
    if (_createdCode != null) {
      return _WaitingView(
        roomCode: _createdCode!,
        onCancel: () => setState(() => _createdCode = null),
      );
    }

    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Gap(16),
          const _Illustration('⚔️', 'Créez une salle et partagez\nle code avec votre adversaire'),
          const Gap(40),
          ElevatedButton(
            onPressed: _loading ? null : _createRoom,
            child: _loading
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Créer une salle (Rapide 10 min)'),
          ),
        ],
      ),
    );
  }

  Future<void> _createRoom() async {
    setState(() => _loading = true);
    final code = await ref.read(multiplayerProvider.notifier).createRoom();
    if (!mounted) return;
    setState(() { _loading = false; _createdCode = code; });

    if (code != null) {
      // Écouter l'adversaire qui rejoint
      ref.listen(multiplayerProvider, (_, next) {
        final s = next.valueOrNull;
        if (s != null && s.status == 'ongoing' && mounted) {
          Navigator.pushReplacement(
            context,
            MaterialPageRoute<void>(builder: (_) => const OnlineGameScreen()),
          );
        }
      });
    }
  }

  // ─── Onglet : rejoindre ───────────────────────────────────────────────────

  Widget _buildJoinTab() {
    return Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Gap(16),
          const _Illustration('🔑', 'Entrez le code partagé\npar votre adversaire'),
          const Gap(40),
          TextField(
            controller: _codeCtrl,
            textCapitalization: TextCapitalization.characters,
            textAlign: TextAlign.center,
            maxLength: 6,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 28,
              letterSpacing: 8,
              fontWeight: FontWeight.w700,
            ),
            decoration: InputDecoration(
              hintText: 'XXXXXX',
              hintStyle: TextStyle(
                color: Colors.white.withValues(alpha: 0.2),
                fontSize: 28,
                letterSpacing: 8,
              ),
              counterText: '',
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
            ),
          ),
          const Gap(24),
          ElevatedButton(
            onPressed: _loading ? null : _joinRoom,
            child: _loading
                ? const SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : const Text('Rejoindre la salle'),
          ),
        ],
      ),
    );
  }

  Future<void> _joinRoom() async {
    final code = _codeCtrl.text.trim();
    if (code.length != 6) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Le code doit comporter 6 caractères.')),
      );
      return;
    }
    setState(() => _loading = true);
    final ok = await ref.read(multiplayerProvider.notifier).joinRoom(code);
    if (!mounted) return;
    setState(() => _loading = false);

    if (ok) {
      Navigator.pushReplacement(
        context,
        MaterialPageRoute<void>(builder: (_) => const OnlineGameScreen()),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Code invalide ou salle complète.'),
          backgroundColor: AppTheme.accent,
        ),
      );
    }
  }
}

// ─── Écran d'attente de l'adversaire ─────────────────────────────────────────

class _WaitingView extends StatelessWidget {
  const _WaitingView({required this.roomCode, required this.onCancel});

  final String roomCode;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(color: AppTheme.accent),
            const Gap(32),
            const Text('En attente de l\'adversaire…',
                style: TextStyle(color: Colors.white70, fontSize: 16)),
            const Gap(24),
            const Text('Partagez ce code :',
                style: TextStyle(color: Colors.white38, fontSize: 13)),
            const Gap(12),
            GestureDetector(
              onTap: () async {
                await Clipboard.setData(ClipboardData(text: roomCode));
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Code copié !')),
                  );
                }
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                decoration: BoxDecoration(
                  color: AppTheme.surface,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppTheme.accent.withValues(alpha: 0.5)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      roomCode,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 32,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 6,
                      ),
                    ),
                    const Gap(12),
                    const Icon(Icons.copy, color: Colors.white38, size: 20),
                  ],
                ),
              ),
            ),
            const Gap(32),
            TextButton(onPressed: onCancel, child: const Text('Annuler')),
          ],
        ),
      ),
    );
  }
}

// ─── Widget illustration ──────────────────────────────────────────────────────

class _Illustration extends StatelessWidget {
  const _Illustration(this.emoji, this.text);

  final String emoji;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(emoji, style: const TextStyle(fontSize: 56)),
        const Gap(16),
        Text(text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70, fontSize: 15)),
      ],
    );
  }
}
