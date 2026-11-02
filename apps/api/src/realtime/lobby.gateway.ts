import { Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RatingsService }     from '../ratings/ratings.service';
import { RoomsService }       from '../rooms/rooms.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TimeControlCategory } from '../common/prisma-enums';
import { MetricsService } from '../metrics/metrics.service';

/**
 * Gateway Socket.IO — namespace /lobby.
 *
 * Responsabilités :
 * - Salles privées (créer / attendre / rejoindre)
 * - Matchmaking en temps réel (file Redis + appariement périodique)
 * - Notification des joueurs appariés
 */
@WebSocketGateway({ namespace: '/lobby', cors: { origin: '*' } })
export class LobbyGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger  = new Logger(LobbyGateway.name);
  private periodicTimer!: NodeJS.Timeout;

  constructor(
    private readonly rooms:       RoomsService,
    private readonly matchmaking: MatchmakingService,
    private readonly ratings:     RatingsService,
    private readonly jwtService:  JwtService,
    private readonly notifications: NotificationsService, // sprint 16
    @Optional() private readonly metrics?: MetricsService, // sprint 19
  ) {}

  /** Sprint 19 : la minuterie ne survit plus à l'arrêt du module (tests, SIGTERM). */
  onModuleDestroy() {
    clearInterval(this.periodicTimer);
  }

  afterInit() {
    // Vérification périodique de la file toutes les 10 secondes
    this.periodicTimer = setInterval(async () => {
      await this.runPeriodicMatching();
    }, 10_000);
    this.logger.log('Lobby gateway initialisé — vérification toutes les 10 s');
  }

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (token) {
        const payload = this.jwtService.verify<{ sub: string }>(token);
        (client as any).userId = payload.sub;
      }
    } catch {
      // Connexion anonyme autorisée (salles privées sans compte)
    }
    this.metrics?.wsConnected('lobby');
    this.logger.debug(`Lobby connecté : ${client.id}`);
  }

  /** Sprint 19 : jauge chess_api_ws_connections{namespace="lobby"}. */
  async handleDisconnect(client: Socket) {
    this.metrics?.wsDisconnected('lobby');
    this.logger.debug(`Lobby déconnecté : ${client.id}`);

    // Sprint 20 : quitter l'appli = quitter la file d'attente.
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;
    try {
      if (await this.matchmaking.dequeueSocket(userId, client.id)) {
        this.logger.debug(`${userId} retiré de la file (déconnexion)`);
      }
    } catch (err) {
      this.logger.warn(`Retrait de la file impossible pour ${userId} : ${err}`);
    }
  }

  // ──────────────────────────────────────────────
  // Matchmaking — rejoindre la file
  // ──────────────────────────────────────────────

  @SubscribeMessage('lobby:joinQueue')
  async handleJoinQueue(
    @MessageBody() data: { timeControl?: TimeControlCategory },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) {
      client.emit('lobby:error', { message: 'Authentification requise pour le matchmaking.' });
      return;
    }

    const tc  = data.timeControl ?? TimeControlCategory.RAPID;
    const elo = await this.ratings.getElo(userId, tc);

    client.emit('lobby:queued', {
      timeControl: tc,
      elo,
      message: `En attente d'un adversaire (Elo ${elo})…`,
    });

    // Rejoindre la room de notification et la file Redis
    await client.join(`lobby:queue:${tc}`);

    const match = await this.matchmaking.enqueue({
      userId,
      socketId:    client.id,
      elo,
      timeControl: tc,
      queuedAt:    Date.now(),
    });

    if (match) {
      await this.notifyMatch(match);
    }
  }

  // ──────────────────────────────────────────────
  // Matchmaking — quitter la file
  // ──────────────────────────────────────────────

  @SubscribeMessage('lobby:leaveQueue')
  async handleLeaveQueue(@ConnectedSocket() client: Socket) {
    const userId = (client as any).userId as string | undefined;
    if (!userId) return;

    const status = await this.matchmaking.getStatus(userId);
    if (status.status === 'waiting' && status.timeControl) {
      await this.matchmaking.dequeue(userId, status.timeControl as TimeControlCategory);
      await client.leave(`lobby:queue:${status.timeControl}`);
    }
    client.emit('lobby:leftQueue');
  }

  // ──────────────────────────────────────────────
  // Salles privées — créer
  // ──────────────────────────────────────────────

  @SubscribeMessage('lobby:createRoom')
  async handleCreateRoom(
    @MessageBody() data: { timeControl?: TimeControlCategory },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = (client as any).userId as string | undefined;
      const result = await this.rooms.create(
        data.timeControl ?? TimeControlCategory.RAPID,
        userId,
      );
      client.emit('lobby:roomCreated', result);
    } catch (err) {
      client.emit('lobby:error', { message: `Impossible de créer la salle : ${err}` });
    }
  }

  // ──────────────────────────────────────────────
  // Salles privées — attendre dans la salle
  // ──────────────────────────────────────────────

  @SubscribeMessage('lobby:waitRoom')
  async handleWaitRoom(
    @MessageBody() data: { roomCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(`lobby:waiting:${data.roomCode}`);
    client.emit('lobby:waiting', { roomCode: data.roomCode });
  }

  // ──────────────────────────────────────────────
  // Salles privées — rejoindre par code
  // ──────────────────────────────────────────────

  @SubscribeMessage('lobby:joinRoom')
  async handleJoinRoom(
    @MessageBody() data: { roomCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const userId = (client as any).userId as string | undefined;
      const game   = await this.rooms.join(data.roomCode, userId);

      client.emit('lobby:roomJoined', {
        gameId:   game.id,
        roomCode: game.roomCode,
      });

      // Notifier l'hôte
      this.server
        .to(`lobby:waiting:${data.roomCode}`)
        .emit('lobby:opponentJoined', { gameId: game.id });

      // Sprint 16 : notification (et push) à l'hôte, qui a pu quitter l'appli
      this.notifications
        .notifyRoomJoined(game)
        .catch((err) => this.logger.warn(`Notification ignorée : ${err}`));
    } catch (err: any) {
      client.emit('lobby:error', { message: err?.message ?? 'Code invalide.' });
    }
  }

  // ──────────────────────────────────────────────
  // Matchmaking périodique
  // ──────────────────────────────────────────────

  private async runPeriodicMatching(): Promise<void> {
    for (const tc of Object.values(TimeControlCategory)) {
      try {
        const matches = await this.matchmaking.periodicCheck(tc);
        for (const match of matches) {
          await this.notifyMatch(match);
        }
      } catch (err) {
        this.logger.warn(`Erreur matchmaking ${tc} : ${err}`);
      }
    }
  }

  // ──────────────────────────────────────────────
  // Notification d'appariement
  // ──────────────────────────────────────────────

  private async notifyMatch(match: Awaited<ReturnType<MatchmakingService['tryMatch']>>) {
    if (!match) return;

    const payload = (color: 'white' | 'black', elo: number, displayName: string | null) => ({
      gameId:      match.gameId,
      color,
      opponent:    { elo, displayName }, // sprint 20 : nom, comme documenté
      timeControl: match.timeControl,
    });

    // Émettre directement aux sockets par leur ID (sur n'importe quel pod,
    // grâce à l'adaptateur Redis)
    this.server
      .to(match.whiteSocketId)
      .emit('lobby:matchFound', payload('white', match.blackElo, match.blackName));

    this.server
      .to(match.blackSocketId)
      .emit('lobby:matchFound', payload('black', match.whiteElo, match.whiteName));

    this.logger.log(
      `Appariement notifié : partie ${match.gameId} ` +
      `(${match.whiteUserId} vs ${match.blackUserId})`,
    );
  }
}
