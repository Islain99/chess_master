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

/// Client HTTP autour du package [http].
/// [accessToken] est transmis en header Authorization: Bearer si fourni.
class ApiClient {
  ApiClient({http.Client? client, this.accessToken})
      : _client = client ?? http.Client();

  final http.Client _client;

  /// Token JWT d'accès à inclure dans les headers si non null.
  final String? accessToken;

  // ─── Parties ──────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> createGame({
    required String mode,
    required String timeControl,
    int? aiLevel,
    int? aiTargetElo,
  }) async {
    return post('/games', {
      'mode': mode,
      'timeControl': timeControl,
      if (aiLevel != null) 'aiLevel': aiLevel,
      if (aiTargetElo != null) 'aiTargetElo': aiTargetElo,
    });
  }

  Future<Map<String, dynamic>> getGame(String gameId) async {
    return get('/games/$gameId');
  }

  Future<Map<String, dynamic>> makeMove(
    String gameId,
    String uci, {
    int? timeSpentMs,
  }) async {
    return post('/games/$gameId/moves', {
      'uci': uci,
      if (timeSpentMs != null) 'timeSpentMs': timeSpentMs,
    });
  }

  Future<Map<String, dynamic>> undoMove(String gameId) async {
    return post('/games/$gameId/undo', {});
  }

  Future<Map<String, dynamic>> resign(String gameId, String color) async {
    return post('/games/$gameId/resign', {'color': color});
  }

  Future<Map<String, dynamic>> acceptDraw(String gameId) async {
    return post('/games/$gameId/draw', {});
  }

  Future<String> getPgn(String gameId) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}/games/$gameId/pgn');
    final response = await _client
        .get(uri, headers: _headers(accept: 'text/plain'))
        .timeout(ApiConfig.receiveTimeout);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return response.body;
    }
    throw ApiException(
      statusCode: response.statusCode,
      error: 'PGN_ERROR',
      message: 'Impossible de récupérer le PGN.',
    );
  }

  Future<Map<String, dynamic>> importGame({String? fen, String? pgn}) async {
    return post('/games/import', {
      if (fen != null) 'fen': fen,
      if (pgn != null) 'pgn': pgn,
    });
  }

  // ─── HTTP helpers publics (utilisés par AuthProvider) ────────────────────

  Future<Map<String, dynamic>> get(String path) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final response = await _client
        .get(uri, headers: _headers())
        .timeout(ApiConfig.receiveTimeout);
    return _parseResponse(response);
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final response = await _client
        .post(uri, headers: _headers(), body: jsonEncode(body))
        .timeout(ApiConfig.receiveTimeout);
    return _parseResponse(response);
  }

  /// Sprint 16 : PATCH (ex. /notifications/:id/read).
  Future<Map<String, dynamic>> patch(
    String path, [
    Map<String, dynamic> body = const {},
  ]) async {
    final uri = Uri.parse('${ApiConfig.baseUrl}$path');
    final response = await _client
        .patch(uri, headers: _headers(), body: jsonEncode(body))
        .timeout(ApiConfig.receiveTimeout);
    return _parseResponse(response);
  }

  /// Sprint 16 : DELETE avec corps JSON facultatif (ex. /notifications/devices).
  Future<Map<String, dynamic>> delete(
    String path, [
    Map<String, dynamic>? body,
  ]) async {
    final request = http.Request('DELETE', Uri.parse('${ApiConfig.baseUrl}$path'))
      ..headers.addAll(_headers());
    if (body != null) request.body = jsonEncode(body);
    final streamed = await _client.send(request).timeout(ApiConfig.receiveTimeout);
    return _parseResponse(await http.Response.fromStream(streamed));
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  Map<String, String> _headers({String accept = 'application/json'}) => {
    'Content-Type': 'application/json',
    'Accept': accept,
    if (accessToken != null) 'Authorization': 'Bearer $accessToken',
  };

  Map<String, dynamic> _parseResponse(http.Response response) {
    // Sprint 16 : 204 No Content (logout, appareils push…) → corps vide.
    final decoded = response.body.isEmpty ? null : jsonDecode(response.body);
    final body = decoded is Map<String, dynamic> ? decoded : <String, dynamic>{};
    if (response.statusCode >= 200 && response.statusCode < 300) return body;
    throw ApiException(
      statusCode: response.statusCode,
      error: body['error']?.toString() ?? 'ERROR',
      message: body['message']?.toString() ?? 'Erreur inconnue.',
    );
  }
}
