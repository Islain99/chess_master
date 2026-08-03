import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

/// Wrapper animé autour d'une pièce d'échecs.
/// Déclenche une animation de fondu lors d'un changement de pièce
/// (coup joué, prise, etc.).
class AnimatedChessPiece extends StatefulWidget {
  const AnimatedChessPiece({
    super.key,
    required this.pieceCode,
    required this.size,
    this.isNewPiece = false,
  });

  final String pieceCode;
  final double size;

  /// Vrai si cette pièce vient d'apparaître (après un coup).
  final bool isNewPiece;

  @override
  State<AnimatedChessPiece> createState() => _AnimatedChessPieceState();
}

class _AnimatedChessPieceState extends State<AnimatedChessPiece>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _opacity;

  static const Map<String, String> _unicode = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟',
  };

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 180),
    );
    _opacity = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);

    if (widget.isNewPiece) {
      _ctrl.forward();
    } else {
      _ctrl.value = 1.0;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final symbol = _unicode[widget.pieceCode];
    if (symbol == null) return const SizedBox.shrink();

    final isWhite = widget.pieceCode.startsWith('w');

    return FadeTransition(
      opacity: _opacity,
      child: Text(
        symbol,
        style: TextStyle(
          fontSize: widget.size * 0.72,
          color: isWhite ? Colors.white : Colors.black,
          shadows: isWhite
              ? const [
                  Shadow(color: Colors.black54, blurRadius: 2),
                  Shadow(color: Colors.black38, blurRadius: 4),
                ]
              : const [
                  Shadow(color: Colors.white60, blurRadius: 2),
                  Shadow(color: Colors.white38, blurRadius: 4),
                ],
        ),
      ),
    );
  }
}

/// Case de plateau avec animation de surbrillance au dernier coup.
class LastMoveFlash extends StatefulWidget {
  const LastMoveFlash({super.key, required this.color, required this.child});

  final Color  color;
  final Widget child;

  @override
  State<LastMoveFlash> createState() => _LastMoveFlashState();
}

class _LastMoveFlashState extends State<LastMoveFlash>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<Color?> _colorAnim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync:    this,
      duration: const Duration(milliseconds: 400),
    );
    _colorAnim = ColorTween(
      begin: AppTheme.accent.withOpacity(0.6),
      end:   widget.color,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOut));
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (_, child) => ColoredBox(
        color: _colorAnim.value ?? widget.color,
        child: child,
      ),
      child: widget.child,
    );
  }
}
