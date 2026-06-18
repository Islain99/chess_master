import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class ApiException implements Exception {
  final int statusCode;
  final String error;
  final String message;

  const ApiException({
    required this.statusCode,
    required this.error,
    required this.message,
  });

  @override
  String toString() => 'ApiException($statusCode): $error — $message';
}

/// Client HTTP léger autour du package [http].
/// En sprint 5, il sera étendu pour transmettre le JWT dans les headers.
class ApiClient {
  ApiClient({http.Client? client}) : _client = client ?? http.Client();

  final http.Client _client;

  // ─── Parties ─────────────────────────────────────────────────────────────

  /// Crée une nouvelle partie. [mode] : "LOCAL", "AI", "PRIVATE", "MATCHMAKING".
  Future<Map<String, dynamic>> createGame({
    required String mode,
    required String timeControl,
    int? aiLevel,
    int? aiTargetElo,
  }) async {
    return _post('/games', {
      'mode': mode,
      'timeControl': timeControl,
      if (aiLevel != null) 'aiLevel': aiLevel,
      if (aiTargetElo != null) 'aiTargetElo': aiTargetElo,
    });
  }

  /// Récupère l'état courant d'une partie (FEN + coups légaux + horloges).
  Future<Map<String, dynamic>> getGame(String gameId) async {
    return _get('/games/$gameId');
  }

  /// Envoie un coup au serveur (format UCI, ex. "e2e4", "e7e8q").
  /// Le serveur revalide le coup avec chess.js et renvoie le nouvel état.
  Future<Map<String, dynamic>> makeMove(
    String gameId,
    String uci, {
    int? timeSpentMs,
  }) async {
    return _post('/games/$gameId/moves', {
      'uci': uci,
      if (timeSpentMs != null) 'timeSpentMs': timeSpentMs,
    });
  }

  /// Abandon : [color] est "white" ou "black".
  Future<Map<String, dynamic>> resign(String gameId, String color) async {
    return _post('/games/$gameId/resign', {'color': color});
  }

  // ─── HTTP helpers ────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> _get(String path) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final response = await _client
        .get(uri, headers: _headers())
        .timeout(ApiConfig.receiveTimeout);
    return _parseResponse(response);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final response = await _client
        .post(uri, headers: _headers(), body: jsonEncode(body))
        .timeout(ApiConfig.receiveTimeout);
    return _parseResponse(response);
  }

  Map<String, String> _headers() => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  Map<String, dynamic> _parseResponse(http.Response response) {
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode >= 200 && response.statusCode < 300) return body;
    throw ApiException(
      statusCode: response.statusCode,
      error: body['error']?.toString() ?? 'ERROR',
      message: body['message']?.toString() ?? 'Erreur inconnue.',
    );
  }
}
