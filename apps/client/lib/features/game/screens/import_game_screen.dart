import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/game_provider.dart';
import 'game_screen.dart';

/// Écran permettant d'importer une partie depuis un FEN ou un PGN.
class ImportGameScreen extends ConsumerStatefulWidget {
  const ImportGameScreen({super.key});

  @override
  ConsumerState<ImportGameScreen> createState() => _ImportGameScreenState();
}

class _ImportGameScreenState extends ConsumerState<ImportGameScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  final _fenController = TextEditingController();
  final _pgnController = TextEditingController();
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _fenController.dispose();
    _pgnController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('Importer une partie'),
        bottom: TabBar(
          controller: _tabController,
          tabs: const [Tab(text: 'FEN'), Tab(text: 'PGN')],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [_buildFenTab(), _buildPgnTab()],
      ),
    );
  }

  Widget _buildFenTab() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Collez une chaîne FEN pour démarrer la partie depuis cette position.',
            style: TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const Gap(16),
          TextField(
            controller: _fenController,
            style: const TextStyle(
              color: Colors.white,
              fontFamily: 'monospace',
              fontSize: 13,
            ),
            decoration: InputDecoration(
              hintText: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
              hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 12),
              filled: true,
              fillColor: AppTheme.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
            ),
            maxLines: 3,
          ),
          const Gap(20),
          _ActionButton(
            label: 'Charger la position',
            loading: _loading,
            onPressed: _importFen,
          ),
        ],
      ),
    );
  }

  Widget _buildPgnTab() {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Collez un PGN complet (avec ou sans en-têtes) pour rejouer la partie.',
            style: TextStyle(color: Colors.white70, fontSize: 14),
          ),
          const Gap(16),
          Expanded(
            child: TextField(
              controller: _pgnController,
              style: const TextStyle(
                color: Colors.white,
                fontFamily: 'monospace',
                fontSize: 12,
              ),
              decoration: InputDecoration(
                hintText: '[Event "Partie"]\n[Result "*"]\n\n1. e4 e5 2. Nf3...',
                hintStyle: TextStyle(color: Colors.white.withValues(alpha: 0.3), fontSize: 11),
                filled: true,
                fillColor: AppTheme.surface,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                alignLabelWithHint: true,
              ),
              maxLines: null,
              expands: true,
            ),
          ),
          const Gap(16),
          _ActionButton(
            label: 'Importer le PGN',
            loading: _loading,
            onPressed: _importPgn,
          ),
        ],
      ),
    );
  }

  Future<void> _importFen() async {
    final fen = _fenController.text.trim();
    if (fen.isEmpty) return;
    setState(() => _loading = true);
    try {
      await ref.read(gameProvider.notifier).importFromFen(fen);
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(builder: (_) => const GameScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('FEN invalide : $e'),
            backgroundColor: AppTheme.accent,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _importPgn() async {
    final pgn = _pgnController.text.trim();
    if (pgn.isEmpty) return;
    setState(() => _loading = true);
    try {
      await ref.read(gameProvider.notifier).importFromPgn(pgn);
      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(builder: (_) => const GameScreen()),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('PGN invalide : $e'),
            backgroundColor: AppTheme.accent,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.loading,
    required this.onPressed,
  });

  final String label;
  final bool loading;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: loading ? null : onPressed,
        child: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              )
            : Text(label),
      ),
    );
  }
}
