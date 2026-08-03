import { Logger } from '@nestjs/common';
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
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(GameGateway.name);

  /** socket.id → ConnInfo */
  private readonly connections = new Map<string, ConnInfo>();

  /** gameId → timer de forfait en cas de déconnexion */
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly moveLimiter = new WsRateLimiter(5_000, 20);

  constructor(
    private readonly gamesService: GamesService,
    private readonly jwtService: JwtService,
  ) {}

  // ──────────────────────────────────────────────
  // Connexion / déconnexion
  // ──────────────────────────────────────────────

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (token) {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        this.connections.set(client.id, { userId: payload.sub });
      } else {
        this.connections.set(client.id, {});
      }
    } catch {
      // Token absent ou invalide → connexion anonyme (jeux locaux)
      this.connections.set(client.id, {});
    }
    this.logger.debug(`Connecté : ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const conn = this.connections.get(client.id);
    if (conn?.gameId) {
      // Notifier l'adversaire et démarrer la période de grâce (30 s)
      client.to(`game:${conn.gameId}`).emit('game:opponentDisconnected', {
        graceMs: 30_000,
      });

      const timer = setTimeout(async () => {
        // Si la partie est toujours en cours après 30 s : forfait
        try {
          const state = await this.gamesService.findById(conn.gameId!);
          if (state.status === 'ONGOING') {
            await this.gamesService.resign(
              conn.gameId!,
              conn.color ?? 'white',
            );
            this.server.to(`game:${conn.gameId}`).emit('game:ended', {
              result: conn.color === 'white' ? 'BLACK_WIN' : 'WHITE_WIN',
              reason: 'ABANDONED',
            });
          }
        } catch (err) {
          this.logger.warn(`Forfait impossible : ${err}`);
        }
        this.disconnectTimers.delete(conn.gameId!);
      }, 30_000);

      this.disconnectTimers.set(conn.gameId, timer);
    }

    this.moveLimiter.remove(client.id);
    this.connections.delete(client.id);
    this.logger.debug(`Déconnecté : ${client.id}`);
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

    // Annuler le forfait si le joueur se reconnecte
    const timer = this.disconnectTimers.get(data.gameId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(data.gameId);
      client.to(`game:${data.gameId}`).emit('game:opponentReconnected');
    }

    await client.join(`game:${data.gameId}`);

    try {
      const state = await this.gamesService.findById(data.gameId);

      // Déterminer la couleur du joueur connecté
      if (conn.userId) {
        if ((state as any).whitePlayerId === conn.userId) conn.color = 'white';
        else if ((state as any).blackPlayerId === conn.userId) conn.color = 'black';
      }
      this.connections.set(client.id, conn);

      // Diffuser l'état à toute la room (y compris le joueur qui vient de rejoindre)
      // → permet à l'hôte de détecter que l'adversaire a rejoint
      this.server.to(`game:${data.gameId}`).emit('game:state', {
        ...state,
        playerColor: conn.color ?? null,
      });
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
      const result = await this.gamesService.makeMove(data.gameId, {
        uci: data.uci,
        timeSpentMs: data.timeSpentMs,
      });

      // Diffuser le coup validé à tous les joueurs de la room
      this.server.to(`game:${data.gameId}`).emit('game:moveMade', result);

      if (result.game.status === 'FINISHED') {
        this.server.to(`game:${data.gameId}`).emit('game:ended', {
          result: result.game.result,
          reason: result.game.resultReason,
        });
      }
    } catch (err: any) {
      // Coup illégal → renvoyer uniquement à son auteur
      client.emit('game:invalidMove', {
        reason: err?.response?.error ?? 'ILLEGAL_MOVE',
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
    @ConnectedSocket() _client: Socket,
  ) {
    try {
      const game = await this.gamesService.resign(data.gameId, data.color);
      this.server.to(`game:${data.gameId}`).emit('game:ended', {
        result: game.result,
        reason: game.resultReason,
      });
    } catch (err) {
      this.logger.warn(`game:resign error : ${err}`);
    }
  }

  // ──────────────────────────────────────────────
  // game:drawOffer — proposer la nulle
  // ──────────────────────────────────────────────

  @SubscribeMessage('game:drawOffer')
  handleDrawOffer(
    @MessageBody() data: { gameId: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Notifier uniquement l'adversaire
    client.to(`game:${data.gameId}`).emit('game:drawOffered');
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
        await this.gamesService.acceptDraw(data.gameId);
        this.server.to(`game:${data.gameId}`).emit('game:ended', {
          result: 'DRAW',
          reason: 'DRAW_AGREEMENT',
        });
      } catch (err) {
        this.logger.warn(`game:drawResponse error : ${err}`);
      }
    } else {
      client.to(`game:${data.gameId}`).emit('game:drawDeclined');
    }
  }
}
