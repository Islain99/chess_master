import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../providers/game_provider.dart';
import 'game_screen.dart';

/// Écran d'export PGN et d'import PGN/FEN.
class PgnScreen extends ConsumerStatefulWidget {
  const PgnScreen({super.key, this.initialPgn});

  /// Si fourni, le champ d'export est pré-rempli (fin de partie).
  final String? initialPgn;

  @override
  ConsumerState<PgnScreen> createState() => _PgnScreenState();
}

class _PgnScreenState extends ConsumerState<PgnScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabs;
  final _fenCtrl  = TextEditingController();
  final _pgnCtrl  = TextEditingController();
  bool _loading   = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    if (widget.initialPgn != null) _pgnCtrl.text = widget.initialPgn!;
  }

  @override
  void dispose() {
    _tabs.dispose();
    _fenCtrl.dispose();
    _pgnCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.background,
      appBar: AppBar(
        title: const Text('PGN / FEN'),
        bottom: TabBar(
          controller: _tabs,
          indicatorColor: AppTheme.accent,
          labelColor: Colors.white,
          unselectedLabelColor: Colors.white54,
          tabs: const [
            Tab(text: 'Import'),
            Tab(text: 'Export PGN'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabs,
        children: [
          _buildImportTab(),
          _buildExportTab(),
        ],
      ),
    );
  }

  // ─── Onglet Import ──────────────────────────────────────────────────────────

  Widget _buildImportTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionTitle(label: 'Position FEN'),
          const Gap(8),
          _textField(
            controller: _fenCtrl,
            hint: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            lines: 2,
          ),
          const Gap(12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.play_arrow),
              label: const Text('Jouer depuis ce FEN'),
              onPressed: _loading ? null : _importFen,
            ),
          ),

          const Gap(28),
          _SectionTitle(label: 'Partie PGN'),
          const Gap(8),
          _textField(
            controller: _pgnCtrl,
            hint: '[White "Kasparov"]\n[Black "Deep Blue"]\n1. e4 e5 2. Nf3 …',
            lines: 8,
          ),
          const Gap(12),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.import_export),
              label: const Text('Analyser ce PGN'),
              onPressed: _loading ? null : _importPgn,
            ),
          ),

          if (_error != null) ...[
            const Gap(12),
            Text(_error!,
                style: const TextStyle(color: Colors.redAccent, fontSize: 13)),
          ],

          if (_loading) ...[
            const Gap(20),
            const Center(child: CircularProgressIndicator()),
          ],
        ],
      ),
    );
  }

  // ─── Onglet Export ──────────────────────────────────────────────────────────

  Widget _buildExportTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionTitle(label: 'PGN de la partie en cours'),
          const Gap(12),
          if (widget.initialPgn != null) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.surface,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.white12),
              ),
              child: SelectableText(
                widget.initialPgn!,
                style: const TextStyle(
                  color: Colors.white70,
                  fontSize: 13,
                  fontFamily: 'monospace',
                  height: 1.5,
                ),
              ),
            ),
            const Gap(12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                icon: const Icon(Icons.copy),
                label: const Text('Copier le PGN'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.white,
                  side: const BorderSide(color: Colors.white24),
                ),
                onPressed: () => _copyToClipboard(widget.initialPgn!),
              ),
            ),
          ] else
            const Text(
              'Aucune partie à exporter. Jouez d\'abord une partie complète.',
              style: TextStyle(color: Colors.white54),
            ),
        ],
      ),
    );
  }

  // ─── Actions ────────────────────────────────────────────────────────────────

  Future<void> _importFen() async {
    final fen = _fenCtrl.text.trim();
    if (fen.isEmpty) {
      setState(() => _error = 'Entrez un FEN valide.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(gameProvider.notifier).createFromFen(fen);
      if (mounted) {
        Navigator.pop(context);
        Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(builder: (_) => const GameScreen()),
        );
      }
    } catch (e) {
      setState(() => _error = 'FEN invalide : $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _importPgn() async {
    final pgn = _pgnCtrl.text.trim();
    if (pgn.isEmpty) {
      setState(() => _error = 'Entrez un PGN valide.');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ref.read(gameProvider.notifier).importPgn(pgn);
      if (mounted) {
        Navigator.pop(context);
        Navigator.pushReplacement(
          context,
          MaterialPageRoute<void>(builder: (_) => const GameScreen()),
        );
      }
    } catch (e) {
      setState(() => _error = 'PGN invalide : $e');
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _copyToClipboard(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('PGN copié dans le presse-papier'),
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Widget _textField({
    required TextEditingController controller,
    required String hint,
    required int lines,
  }) {
    return TextField(
      controller: controller,
      maxLines: lines,
      style: const TextStyle(color: Colors.white, fontSize: 13),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.white24, fontSize: 12),
        filled: true,
        fillColor: AppTheme.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Colors.white12),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: const BorderSide(color: Colors.white12),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide(color: AppTheme.accent.withOpacity(0.7)),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        color: Colors.white70,
        fontSize: 13,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.5,
      ),
    );
  }
}
