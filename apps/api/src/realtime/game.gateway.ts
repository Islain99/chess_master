import { Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { MetricsService } from '../metrics/metrics.service';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GamesService } from '../games/games.service';
import { Actor, isOnlineGame, SYSTEM_ACTOR } from '../games/game-access';
import { ResultReason } from '../common/prisma-enums';
import {
  GameForNotification,
  NotificationsService,
} from '../notifications/notifications.service';
import { WsRateLimiter } from './ws-rate-limiter';

/** Informations de connexion associées à chaque socket. */
interface ConnInfo {
  userId?: string;
  gameId?: string;
  color?: 'white' | 'black';
}

/**
 * Gateway Socket.IO — namespace /game.
 *
 * Responsabilités :
 * - Authentification JWT au handshake (optionnelle ; jeux locaux sans token)
 * - Gestion des rooms (join / leave)
 * - Validation et diffusion des coups via chess.js
 * - Offre de nulle
 * - Détection et gestion des déconnexions (période de grâce 30 s)
 *
 * Mise à l'échelle : pour plusieurs pods, activer le Redis adapter
 * (@socket.io/redis-adapter) dans main.ts.
 */
@WebSocketGateway({ namespace: '/game', cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  /** socket.id → ConnInfo */
  private readonly connections = new Map<string, ConnInfo>();

  /** `${gameId}:${couleur}` → timer de forfait en cas de déconnexion (sprint 17 : par joueur) */
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Sprint 20 : à l'arrêt du pod, les minuteries de forfait (30 s) se
   * déclenchaient APRÈS la fermeture de Prisma et de Redis (erreurs
   * « Connection is closed ») et retardaient la fin du processus. Un autre
   * pod reprendra la surveillance quand le joueur se reconnectera.
   */
  onModuleDestroy() {
    for (const timer of this.disconnectTimers.values()) clearTimeout(timer);
    this.disconnectTimers.clear();
  }
  private readonly moveLimiter = new WsRateLimiter(5_000, 20);

  /** Sprint 16 : gameId → joueurs (pour savoir qui prévenir après un coup). */
  private readonly players = new Map<string, { white: string | null; black: string | null }>();

  constructor(
    private readonly gamesService: GamesService,
    private readonly jwtService: JwtService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly metrics?: MetricsService, // sprint 19
  ) {}

  // ──────────────────────────────────────────────
  // Notifications (sprint 16)
  // ──────────────────────────────────────────────

  /**
   * Sprint 17 : auteur d'une action = utilisateur authentifié au handshake.
   * Rien de ce que le client met dans le message (couleur…) n'est pris en compte.
   */
  private actorOf(client: Socket): Actor {
    return { userId: this.connections.get(client.id)?.userId };
  }

  /** Message d'erreur lisible pour le client à partir d'une exception Nest. */
  private errorPayload(err: any, fallback: string) {
    const response = err?.response;
    return {
      error: response?.error ?? fallback,
      message: response?.message ?? err?.message ?? fallback,
    };
  }

  /**
   * Utilisateurs ayant un socket ouvert sur cette partie, TOUS PODS CONFONDUS.
   * Sprint 19 : `fetchSockets()` interroge les autres réplicas via
   * l'adaptateur Redis (avant : simple parcours de la mémoire du pod, faux dès
   * qu'il y avait plusieurs réplicas → forfaits et notifications erronés).
   * L'identité est portée par `socket.data.userId` (posée au handshake).
   */
  private async presentUsers(gameId: string): Promise<Set<string>> {
    const sockets = await this.server.in(`game:${gameId}`).fetchSockets();
    return new Set(
      sockets.map((s) => s.data?.userId as string | undefined).filter((u): u is string => !!u),
    );
  }

  private notifySafely(task: () => Promise<unknown>) {
    task().catch((err) => this.logger.warn(`Notification ignorée : ${err}`));
  }

  /** Joueurs d'une partie : cache rempli au game:join, sinon lecture en base. */
  private async gamePlayers(gameId: string) {
    let players = this.players.get(gameId);
    if (!players) {
      const state = await this.gamesService.findById(gameId);
      players = { white: state.whitePlayerId ?? null, black: state.blackPlayerId ?? null };
      this.players.set(gameId, players);
    }
    return { id: gameId, whitePlayerId: players.white, blackPlayerId: players.black };
  }

  private notifyEnded(game: GameForNotification) {
    this.players.delete(game.id); // partie terminée : plus besoin du cache
    this.metrics?.gameFinished(game);
    this.notifySafely(async () => {
      const present = await this.presentUsers(game.id);
      return this.notifications.notifyGameEnded(game, (uid) => present.has(uid));
    });
  }

  // ──────────────────────────────────────────────
  // Connexion / déconnexion
  // ──────────────────────────────────────────────

  handleConnection(client: Socket) {
    this.metrics?.wsConnected('game');
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (token) {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        this.connections.set(client.id, { userId: payload.sub });
        client.data.userId = payload.sub; // sprint 19 : lisible depuis les autres pods
      } else {
        this.connections.set(client.id, {});
      }
    } catch {
      // Token absent ou invalide → connexion anonyme (jeux locaux)
      this.connections.set(client.id, {});
    }
    this.logger.debug(`Connecté : ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    this.metrics?.wsDisconnected('game');
    const conn = this.connections.get(client.id);
    this.moveLimiter.remove(client.id);
    this.connections.delete(client.id);
    this.logger.debug(`Déconnecté : ${client.id}`);

    // Sprint 17 : seul un JOUEUR peut perdre par forfait (avant : un
    // spectateur qui partait faisait perdre les blancs), et seulement s'il
    // n'a plus aucun autre onglet / appareil connecté à la partie.
    if (!conn?.gameId || !conn.color || !conn.userId) return;
    if ((await this.presentUsers(conn.gameId)).has(conn.userId)) return;

    const { gameId, color, userId } = conn;
    client.to(`game:${gameId}`).emit('game:opponentDisconnected', { graceMs: 30_000 });

    const key = `${gameId}:${color}`;
    clearTimeout(this.disconnectTimers.get(key));
    const timer = setTimeout(async () => {
      this.disconnectTimers.delete(key);
      // Revenu entre-temps, éventuellement sur un autre pod
      if ((await this.presentUsers(gameId)).has(userId)) return;
      try {
        const state = await this.gamesService.findById(gameId);
        if (state.status !== 'ONGOING' || !isOnlineGame(state.mode)) return;

        const ended = await this.gamesService.resign(
          gameId,
          color,
          SYSTEM_ACTOR,
          ResultReason.ABANDONED,
        );
        this.server.to(`game:${gameId}`).emit('game:ended', {
          result: ended.result,
          reason: ended.resultReason,
        });
        // Sprint 16 : le joueur resté prévenu même s'il a fermé l'appli entre-temps.
        this.notifyEnded(ended);
      } catch (err) {
        this.logger.warn(`Forfait impossible : ${err}`);
      }
    }, 30_000);
    this.disconnectTimers.set(key, timer);
  }

  // ──────────────────────────────────────────────
  // game:join — rejoindre une room et recevoir l'état
  // ──────────────────────────────────────────────

  @SubscribeMessage('game:join')
  async handleJoin(
    @MessageBody() data: { gameId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const conn: ConnInfo = this.connections.get(client.id) ?? {};
    conn.gameId = data.gameId;

    await client.join(`game:${data.gameId}`);

    try {
      const state = await this.gamesService.findById(data.gameId);
      this.players.set(data.gameId, {
        white: (state as any).whitePlayerId ?? null,
        black: (state as any).blackPlayerId ?? null,
      });

      // Déterminer la couleur du joueur connecté
      if (conn.userId) {
        if ((state as any).whitePlayerId === conn.userId) conn.color = 'white';
        else if ((state as any).blackPlayerId === conn.userId) conn.color = 'black';
      }
      this.connections.set(client.id, conn);

      // Annuler le forfait si ce joueur revient (sprint 17 : timer par couleur)
      const timerKey = `${data.gameId}:${conn.color}`;
      const timer = conn.color ? this.disconnectTimers.get(timerKey) : undefined;
      if (timer) {
        clearTimeout(timer);
        this.disconnectTimers.delete(timerKey);
        client.to(`game:${data.gameId}`).emit('game:opponentReconnected');
      }

      // État complet au socket qui rejoint, AVEC sa couleur…
      client.emit('game:state', { ...state, playerColor: conn.color ?? null });
      // …et aux autres membres de la room (l'hôte voit l'adversaire arriver)
      // SANS couleur. Sprint 21 : la couleur du nouvel arrivant était diffusée
      // à toute la room ; quand les noirs rejoignaient, le client des blancs
      // adoptait « black » et ne pouvait plus jouer.
      client.to(`game:${data.gameId}`).emit('game:state', state);
    } catch (err) {
      client.emit('game:error', { message: 'Partie introuvable.' });
      this.logger.warn(`game:join error : ${err}`);
    }
  }

  // ──────────────────────────────────────────────
  // game:move — jouer un coup (revalidé côté serveur)
  // ──────────────────────────────────────────────

  @SubscribeMessage('game:move')
  async handleMove(
    @MessageBody() data: { gameId: string; uci: string; timeSpentMs?: number },
    @ConnectedSocket() client: Socket,
  ) {
    if (!this.moveLimiter.check(client.id)) {
      client.emit('game:invalidMove', { reason: 'RATE_LIMITED', uci: data.uci });
      return;
    }
    try {
      // Sprint 17 : le service vérifie joueur + tour ; timeSpentMs est
      // ignoré en ligne (pendule mesurée par le serveur).
      const result = await this.gamesService.makeMove(
        data.gameId,
        { uci: data.uci, timeSpentMs: data.timeSpentMs },
        this.actorOf(client),
      );

      // Diffuser le coup validé à tous les joueurs de la room
      this.server.to(`game:${data.gameId}`).emit('game:moveMade', result);

      if (result.game.status === 'FINISHED') {
        this.server.to(`game:${data.gameId}`).emit('game:ended', {
          result: result.game.result,
          reason: result.game.resultReason,
        });
        this.notifySafely(async () =>
          this.notifyEnded({ ...(await this.gamePlayers(data.gameId)), ...result.game }),
        );
      } else {
        // Sprint 16 : « À vous de jouer » si l'adversaire n'est pas devant la partie.
        this.notifySafely(async () => {
          const present = await this.presentUsers(data.gameId);
          return this.notifications.notifyTurn(
            { ...(await this.gamePlayers(data.gameId)), fen: result.game.fen },
            result.move?.san,
            (uid) => present.has(uid),
          );
        });
      }
    } catch (err: any) {
      // Coup illégal, pas son tour, pas joueur… → uniquement à son auteur
      client.emit('game:invalidMove', {
        reason: err?.response?.error ?? 'ILLEGAL_MOVE',
        message: err?.response?.message,
        uci: data.uci,
      });
    }
  }

  // ──────────────────────────────────────────────
  // game:resign — abandonner
  // ──────────────────────────────────────────────

  @SubscribeMessage('game:resign')
  async handleResign(
    @MessageBody() data: { gameId: string; color: 'white' | 'black' },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Sprint 17 : en ligne, la couleur est celle du joueur authentifié
      // (data.color ne sert qu'aux parties locales).
      const game = await this.gamesService.resign(
        data.gameId,
        data.color === 'black' ? 'black' : 'white',
        this.actorOf(client),
      );
      this.server.to(`game:${data.gameId}`).emit('game:ended', {
        result: game.result,
        reason: game.resultReason,
      });
      this.notifyEnded(game);
    } catch (err) {
      this.logger.warn(`game:resign refusé : ${err}`);
      client.emit('game:error', this.errorPayload(err, 'RESIGN_REFUSED'));
    }
  }

  // ──────────────────────────────────────────────
  // game:drawOffer — proposer la nulle
  // ──────────────────────────────────────────────

  @SubscribeMessage('game:drawOffer')
  async handleDrawOffer(
    @MessageBody() data: { gameId: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      // Sprint 17 : seule une proposition d'un joueur est enregistrée et relayée.
      const by = await this.gamesService.offerDraw(data.gameId, this.actorOf(client));
      client.to(`game:${data.gameId}`).emit('game:drawOffered', { by });
    } catch (err) {
      client.emit('game:error', this.errorPayload(err, 'DRAW_OFFER_REFUSED'));
    }
  }

  // ──────────────────────────────────────────────
  // game:drawResponse — répondre à une offre de nulle
  // ──────────────────────────────────────────────

  @SubscribeMessage('game:drawResponse')
  async handleDrawResponse(
    @MessageBody() data: { gameId: string; accept: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    if (data.accept) {
      try {
        // Sprint 17 : refusé s'il n'y a pas de proposition de l'adversaire.
        const game = await this.gamesService.acceptDraw(data.gameId, this.actorOf(client));
        this.server.to(`game:${data.gameId}`).emit('game:ended', {
          result: 'DRAW',
          reason: 'DRAW_AGREEMENT',
        });
        this.notifyEnded(game);
      } catch (err) {
        this.logger.warn(`game:drawResponse refusé : ${err}`);
        client.emit('game:error', this.errorPayload(err, 'DRAW_ACCEPT_REFUSED'));
      }
    } else {
      try {
        await this.gamesService.declineDraw(data.gameId, this.actorOf(client));
        client.to(`game:${data.gameId}`).emit('game:drawDeclined');
      } catch (err) {
        client.emit('game:error', this.errorPayload(err, 'DRAW_DECLINE_REFUSED'));
      }
    }
  }
}
