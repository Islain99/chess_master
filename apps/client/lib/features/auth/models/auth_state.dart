/// État d'authentification persisté entre les sessions.
class AuthUser {
  const AuthUser({
    required this.id,
    required this.email,
    required this.displayName,
    this.avatarUrl,
    this.country,
    required this.role,
    this.authProvider = 'LOCAL',
  });

  final String id;
  final String email;
  final String displayName;
  final String? avatarUrl;
  final String? country;
  final String role;

  /// LOCAL (courriel / mot de passe), GOOGLE, APPLE ou FACEBOOK.
  final String authProvider;

  /// Compte à mot de passe : exigé pour confirmer une suppression.
  bool get hasPassword => authProvider == 'LOCAL';

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id:          json['id'] as String,
        email:       json['email'] as String? ?? '',
        displayName: json['displayName'] as String,
        avatarUrl:   json['avatarUrl'] as String?,
        country:     json['country'] as String?,
        role:        json['role'] as String? ?? 'PLAYER',
        authProvider: json['authProvider'] as String? ?? 'LOCAL',
      );

  @override
  String toString() => 'AuthUser($id, $email)';
}

/// Tokens JWT côté client.
class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
  });

  final String accessToken;
  final String refreshToken;
  final DateTime expiresAt;

  bool get isExpired => DateTime.now().isAfter(expiresAt);

  /// Sauvegarder les tokens dans SharedPreferences.
  Map<String, String> toStorage() => {
    'access_token':  accessToken,
    'refresh_token': refreshToken,
    'expires_at':    expiresAt.millisecondsSinceEpoch.toString(),
  };

  factory AuthTokens.fromStorage(Map<String, String> map) => AuthTokens(
    accessToken:  map['access_token']!,
    refreshToken: map['refresh_token']!,
    expiresAt:    DateTime.fromMillisecondsSinceEpoch(
                    int.parse(map['expires_at']!)),
  );
}
