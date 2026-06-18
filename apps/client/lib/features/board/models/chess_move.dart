/// Représente un demi-coup (ply) tel que retourné par le serveur.
class ChessMove {
  const ChessMove({
    required this.ply,
    required this.san,
    required this.uci,
    required this.fenAfter,
    this.isCheck = false,
    this.isCheckmate = false,
    this.isCapture = false,
  });

  final int ply;
  final String san;         // Notation algébrique abrégée (ex. "e4", "Nf3")
  final String uci;         // Notation UCI (ex. "e2e4", "e7e8q")
  final String fenAfter;
  final bool isCheck;
  final bool isCheckmate;
  final bool isCapture;

  String get from => uci.substring(0, 2);
  String get to   => uci.substring(2, 4);

  factory ChessMove.fromJson(Map<String, dynamic> json) => ChessMove(
        ply: json['ply'] as int,
        san: json['san'] as String,
        uci: json['uci'] as String,
        fenAfter: json['fenAfter'] as String,
        isCheck: (json['isCheck'] as bool?) ?? false,
        isCheckmate: (json['isCheckmate'] as bool?) ?? false,
        isCapture: (json['isCapture'] as bool?) ?? false,
      );

  @override
  String toString() => 'ChessMove($ply. $san [$uci])';
}
