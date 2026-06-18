class ApiConfig {
  // En développement local, pointer vers le backend docker-compose.
  // Sur mobile physique, remplacer par l'IP de la machine hôte.
  static const String baseUrl =
      String.fromEnvironment('API_URL', defaultValue: 'http://localhost:3000/api/v1');

  static const Duration connectTimeout = Duration(seconds: 10);
  static const Duration receiveTimeout = Duration(seconds: 15);
}
