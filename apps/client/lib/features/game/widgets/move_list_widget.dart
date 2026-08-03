import 'package:flutter/material.dart';
import 'package:gap/gap.dart';
import '../../../core/theme/app_theme.dart';
import '../../board/models/chess_move.dart';

/// Historique des coups horizontal et auto-scrollable.
/// Chaque paire de demi-coups est présentée sous la forme "1. e4 e5".
class MoveListWidget extends StatefulWidget {
  const MoveListWidget({super.key, required this.moves});

  final List<ChessMove> moves;

  @override
  State<MoveListWidget> createState() => _MoveListWidgetState();
}

class _MoveListWidgetState extends State<MoveListWidget> {
  final _controller = ScrollController();

  @override
  void didUpdateWidget(MoveListWidget old) {
    super.didUpdateWidget(old);
    // Auto-scroll vers le dernier coup après rebuild
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_controller.hasClients) {
        _controller.animateTo(
          _controller.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.moves.isEmpty) return const SizedBox.shrink();

    final pairs = <(ChessMove, ChessMove?)>[];
    for (int i = 0; i < widget.moves.length; i += 2) {
      final white = widget.moves[i];
      final black = i + 1 < widget.moves.length ? widget.moves[i + 1] : null;
      pairs.add((white, black));
    }

    return Container(
      height: 44,
      color: AppTheme.surface,
      child: ListView.builder(
        controller: _controller,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        itemCount: pairs.length,
        itemBuilder: (context, i) {
          final (white, black) = pairs[i];
          final isLastPair = i == pairs.length - 1;
          return Padding(
            padding: const EdgeInsets.only(right: 14),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  '${i + 1}.',
                  style: const TextStyle(color: Colors.white38, fontSize: 13),
                ),
                const Gap(4),
                _MoveChip(san: white.san, isLast: isLastPair && black == null),
                if (black != null) ...[
                  const Gap(4),
                  _MoveChip(san: black.san, isLast: isLastPair),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}

class _MoveChip extends StatelessWidget {
  const _MoveChip({required this.san, required this.isLast});

  final String san;
  final bool isLast;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: isLast
          ? const EdgeInsets.symmetric(horizontal: 6, vertical: 1)
          : EdgeInsets.zero,
      decoration: isLast
          ? BoxDecoration(
              color: AppTheme.accent.withOpacity(0.25),
              borderRadius: BorderRadius.circular(4),
              border: Border.all(color: AppTheme.accent.withOpacity(0.6)),
            )
          : null,
      child: Text(
        san,
        style: TextStyle(
          color: isLast ? Colors.white : Colors.white70,
          fontSize: 13,
          fontWeight: isLast ? FontWeight.w600 : FontWeight.w400,
        ),
      ),
    );
  }
}
