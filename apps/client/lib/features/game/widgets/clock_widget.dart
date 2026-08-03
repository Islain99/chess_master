import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';

/// Horloge de jeu animée.
/// Change de couleur à moins de 30 s (orange) et clignote à moins de 10 s.
class ClockWidget extends StatefulWidget {
  const ClockWidget({
    super.key,
    required this.timeMs,
    required this.isActive,
  });

  final int timeMs;
  final bool isActive;

  @override
  State<ClockWidget> createState() => _ClockWidgetState();
}

class _ClockWidgetState extends State<ClockWidget>
    with SingleTickerProviderStateMixin {
  late AnimationController _flashCtrl;
  late Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _flashCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _opacity = Tween<double>(begin: 1.0, end: 0.3).animate(_flashCtrl);
  }

  @override
  void didUpdateWidget(ClockWidget old) {
    super.didUpdateWidget(old);
    _updateFlash();
  }

  void _updateFlash() {
    final low = widget.timeMs < 10_000 && widget.isActive;
    if (low && !_flashCtrl.isAnimating) {
      _flashCtrl.repeat(reverse: true);
    } else if (!low) {
      _flashCtrl.stop();
      _flashCtrl.value = 0;
    }
  }

  @override
  void dispose() {
    _flashCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final bg = _bgColor();
    return AnimatedBuilder(
      animation: _opacity,
      builder: (_, __) => Opacity(
        opacity: widget.timeMs < 10_000 && widget.isActive ? _opacity.value : 1.0,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            _format(widget.timeMs),
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
              fontSize: 17,
              fontFeatures: [FontFeature.tabularFigures()],
              letterSpacing: 0.5,
            ),
          ),
        ),
      ),
    );
  }

  Color _bgColor() {
    if (!widget.isActive) return AppTheme.surface;
    if (widget.timeMs < 10_000) return Colors.red.shade700;
    if (widget.timeMs < 30_000) return Colors.orange.shade700;
    return AppTheme.accent;
  }

  String _format(int ms) {
    final totalSec = (ms / 1000).ceil();
    final m = totalSec ~/ 60;
    final s = totalSec % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}
