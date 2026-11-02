import 'package:socket_io_client/socket_io_client.dart' as io;
import '../config/api_config.dart';

typedef JsonCallback = void Function(Map<String, dynamic> data);

/// Wrapper autour de Socket.IO pour le namespace /game.
///
/// Gestion du cycle de vie :
/// - [connect] : ouvre la connexion et s'abonne aux événements
/// - [disconnect] : ferme proprement la connexion
/// Les écouteurs sont ajoutés avec [on] et [onOnce].
class SocketService {
  SocketService._();

  static SocketService? _instance;
  static SocketService get instance => _instance ??= SocketService._();

  io.Socket? _gameSocket;
  io.Socket? _lobbySocket;

  // ─── Namespace /game ──────────────────────────────────────────────────────

  void connectGame({String? token}) {
    _gameSocket?.disconnect();
    _gameSocket = io.io(
      // Sprint 14 : socket_io_client 2.x n'a pas de setNamespace() — le
      // namespace fait partie de l'URL. enableForceNew() évite de réutiliser
      // un Manager en cache avec l'ancien token.
      '${ApiConfig.wsUrl}/game',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableForceNew()
          .setAuth({'token': token ?? ''})
          .enableAutoConnect()
          .enableReconnection()
          .setReconnectionDelay(1000)
          .setReconnectionAttempts(10)
          .build(),
    );
    _gameSocket!.connect();
  }

  void disconnectGame() {
    _gameSocket?.disconnect();
    _gameSocket = null;
  }

  void emitGame(String event, [dynamic data]) {
    _gameSocket?.emit(event, data);
  }

  void onGame(String event, JsonCallback callback) {
    _gameSocket?.on(event, (raw) {
      if (raw is Map) {
        callback(Map<String, dynamic>.from(raw));
      } else if (raw == null) {
        callback({});
      }
    });
  }

  void offGame(String event) {
    _gameSocket?.off(event);
  }

  bool get isGameConnected => _gameSocket?.connected ?? false;

  // ─── Namespace /lobby ─────────────────────────────────────────────────────

  void connectLobby({String? token}) {
    _lobbySocket?.disconnect();
    _lobbySocket = io.io(
      // Sprint 14 : socket_io_client 2.x n'a pas de setNamespace() — le
      // namespace fait partie de l'URL. enableForceNew() évite de réutiliser
      // un Manager en cache avec l'ancien token.
      '${ApiConfig.wsUrl}/lobby',
      io.OptionBuilder()
          .setTransports(['websocket'])
          .enableForceNew()
          .setAuth({'token': token ?? ''})
          .enableAutoConnect()
          .build(),
    );
    _lobbySocket!.connect();
  }

  void disconnectLobby() {
    _lobbySocket?.disconnect();
    _lobbySocket = null;
  }

  void emitLobby(String event, [dynamic data]) {
    _lobbySocket?.emit(event, data);
  }

  void onLobby(String event, JsonCallback callback) {
    _lobbySocket?.on(event, (raw) {
      if (raw is Map) {
        callback(Map<String, dynamic>.from(raw));
      } else if (raw == null) {
        callback({});
      }
    });
  }

  void offLobby(String event) {
    _lobbySocket?.off(event);
  }

  // ─── Cleanup global ───────────────────────────────────────────────────────

  void disconnectAll() {
    disconnectGame();
    disconnectLobby();
  }
}
