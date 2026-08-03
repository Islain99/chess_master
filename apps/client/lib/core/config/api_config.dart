class ApiConfig {
  // REST API
  static const String baseUrl =
      String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000/api/v1');

  // WebSocket (racine sans /api/v1)
  static const String wsUrl =
      String.fromEnvironment('WS_URL', defaultValue: 'http://localhost:3000');

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 15);
}
