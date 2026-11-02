// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Notifications push côté client (Firebase Cloud Messaging)
//
// Cycle de vie (API « FID » de firebase_messaging 17, qui remplace
// getToken/onTokenRefresh/deleteToken, désormais dépréciés) :
//   connexion    → register()   : permission, FirebaseMessaging.register(),
//                                  identifiant d'installation (FID) reçu par
//                                  onRegistered → POST /notifications/devices
//   FID renouvelé → onRegistered à nouveau → réenregistrement automatique
//   déconnexion  → unregister() : DELETE /notifications/devices + unregister()
//
// Côté API, le FID est envoyé dans le champ `token` de FCM HTTP v1, qui
// accepte les FID pendant la migration annoncée par Firebase.
//
// Plateformes : Android, iOS, macOS et Web (navigateurs compatibles Push API).
// Windows et Linux : FCM n'existe pas → service inactif.
//
// Application au premier plan : le système n'affiche PAS la notification ;
// elle est relayée par [foregroundMessages] (bannière dans l'appli).
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../../../core/config/firebase_config.dart';
import '../../../core/http/api_client.dart';

/// Notification reçue, réduite à ce dont l'interface a besoin.
class PushEvent {
  const PushEvent({
    required this.type,
    this.title,
    this.body,
    this.gameId,
    this.notificationId,
  });

  /// YOUR_TURN, GAME_ENDED, GAME_INVITE, SYSTEM (cf. NotificationType de l'API).
  final String type;
  final String? title;
  final String? body;
  final String? gameId;
  final String? notificationId;

  /// Construit l'événement depuis le bloc `data` envoyé par l'API.
  factory PushEvent.fromData(Map<String, dynamic> data, {String? title, String? body}) {
    String? str(String key) {
      final value = data[key];
      return value == null || value.toString().isEmpty ? null : value.toString();
    }

    return PushEvent(
      type: str('type') ?? 'SYSTEM',
      title: title,
      body: body,
      gameId: str('gameId'),
      notificationId: str('notificationId'),
    );
  }

  factory PushEvent.fromRemoteMessage(RemoteMessage message) => PushEvent.fromData(
        message.data,
        title: message.notification?.title,
        body: message.notification?.body,
      );
}

class PushService {
  PushService({
    TargetPlatform? platform,
    bool? isWeb,
    FirebaseOptions? options,
    bool? configured,
  })  : _platform = platform ?? defaultTargetPlatform,
        _isWeb = isWeb ?? kIsWeb,
        _options = options ?? FirebaseConfig.options,
        _configured = configured ?? FirebaseConfig.isConfigured;

  final TargetPlatform _platform;
  final bool _isWeb;
  final FirebaseOptions? _options;
  final bool _configured;

  Future<bool>? _ready;
  String? _token;
  ApiClient? _api;
  StreamSubscription<String>? _registeredSub;
  Completer<String>? _firstRegistration;

  /// Délai maximal d'attente du premier FID après register().
  static const registrationTimeout = Duration(seconds: 30);

  /// Valeur attendue par l'API (enum PushPlatform), ou null si non pris en charge.
  String? get platformName {
    if (_isWeb) return 'WEB';
    return switch (_platform) {
      TargetPlatform.android => 'ANDROID',
      TargetPlatform.iOS => 'IOS',
      TargetPlatform.macOS => 'MACOS',
      _ => null,
    };
  }

  /// Plateforme compatible ET identifiants Firebase fournis à la compilation.
  bool get isAvailable => _configured && _options != null && platformName != null;

  /// FID actuellement enregistré auprès de l'API (null si inactif).
  String? get currentToken => _token;

  // ─── Initialisation ────────────────────────────────────────────────────────

  Future<bool> _ensureReady() => _ready ??= _init();

  Future<bool> _init() async {
    if (!isAvailable) return false;
    try {
      if (Firebase.apps.isEmpty) {
        await Firebase.initializeApp(options: _options);
      }
      // Web : navigateur sans Push API (Safari ancien, navigation privée…).
      return await FirebaseMessaging.instance.isSupported();
    } catch (e) {
      debugPrint('[push] Firebase indisponible : $e');
      return false;
    }
  }

  // ─── Abonnement ────────────────────────────────────────────────────────────

  /// À appeler après la connexion, avec un client API authentifié.
  /// Renvoie true si l'appareil est abonné. Ne lève jamais d'exception.
  Future<bool> register(ApiClient api) async {
    _api = api;
    if (!await _ensureReady()) return false;

    // Déjà abonné (rafraîchissement de session) : on confirme le FID à l'API
    // avec le nouveau jeton d'accès, sans redemander de permission.
    final known = _token;
    if (known != null) {
      try {
        await _sendToken(known);
        return true;
      } catch (_) {
        // l'appareil a pu être retiré côté serveur → réabonnement complet
      }
    }

    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied ||
          settings.authorizationStatus == AuthorizationStatus.notDetermined) {
        return false;
      }

      // iOS/macOS : le jeton FCM n'existe qu'une fois le jeton APNs reçu.
      if (_platform == TargetPlatform.iOS || _platform == TargetPlatform.macOS) {
        if (!_isWeb && !await _waitForApnsToken(messaging)) return false;
      }

      // Écouter AVANT d'appeler register() pour ne pas manquer le premier FID.
      _firstRegistration = Completer<String>();
      _registeredSub ??= messaging.onRegistered.listen((fid) async {
        try {
          await _sendToken(fid);
          if (!(_firstRegistration?.isCompleted ?? true)) _firstRegistration!.complete(fid);
        } catch (e) {
          debugPrint('[push] enregistrement API impossible : $e');
        }
      });

      await messaging.register(
        vapidKey: _isWeb && FirebaseConfig.vapidKey.isNotEmpty ? FirebaseConfig.vapidKey : null,
        serviceWorkerScriptPath: _isWeb ? FirebaseConfig.webServiceWorkerPath : null,
      );

      await _firstRegistration!.future.timeout(registrationTimeout);
      return true;
    } catch (e) {
      debugPrint('[push] abonnement impossible : $e');
      return false;
    }
  }

  /// À appeler AVANT la déconnexion (le client API doit encore être authentifié).
  Future<void> unregister(ApiClient api) async {
    final token = _token;
    await _registeredSub?.cancel();
    _registeredSub = null;
    _token = null;
    _api = null;
    if (token == null) return;

    try {
      await api.delete('/notifications/devices', {'token': token});
    } catch (e) {
      debugPrint('[push] désinscription API impossible : $e');
    }
    try {
      await FirebaseMessaging.instance.unregister();
    } catch (_) {}
  }

  Future<void> _sendToken(String token) async {
    final api = _api;
    if (api == null) return;
    await api.post('/notifications/devices', {'token': token, 'platform': platformName});
    _token = token;
  }

  Future<bool> _waitForApnsToken(FirebaseMessaging messaging) async {
    for (var attempt = 0; attempt < 5; attempt++) {
      if (await messaging.getAPNSToken() != null) return true;
      await Future<void>.delayed(const Duration(seconds: 1));
    }
    debugPrint('[push] jeton APNs indisponible (simulateur ou capability Push manquante ?)');
    return false;
  }

  // ─── Réception ─────────────────────────────────────────────────────────────

  /// Notifications reçues pendant que l'application est au premier plan.
  Stream<PushEvent> foregroundMessages() async* {
    if (!await _ensureReady()) return;
    yield* FirebaseMessaging.onMessage.map(PushEvent.fromRemoteMessage);
  }

  /// Notifications touchées par l'utilisateur, y compris celle qui a lancé l'appli.
  Stream<PushEvent> openedMessages() async* {
    if (!await _ensureReady()) return;
    final initial = await FirebaseMessaging.instance.getInitialMessage();
    if (initial != null) yield PushEvent.fromRemoteMessage(initial);
    yield* FirebaseMessaging.onMessageOpenedApp.map(PushEvent.fromRemoteMessage);
  }
}
