import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { RatingsService }     from '../ratings/ratings.service';
import { RoomsService }       from '../rooms/rooms.service';
import { TimeControlCategory } from '../common/prisma-enums';

/**
 * Gateway Socket.IO — namespace /lobby.
 *
 * Responsabilités :
 * - Salles privées (créer / attendre / rejoindre)
 * - Matchmaking en temps réel (file Redis + appariement périodique)
 * - Notification des joueurs appariés
 */
@WebSocketGateway({ namespace: '/lobby', cors: { origin: '*' } })
export class LobbyGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private readonly logger  = new Logger(LobbyGateway.name);
  private periodicTimer!: NodeJS.Timeout;

  constructor(
    private readonly rooms:       RoomsService,
    private readonly matchmaking: MatchmakingService,
    private readonly ratings:     RatingsService,
    private readonly jwtService:  JwtService,
  ) {}

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
    this.logger.debug(`Lobby connecté : ${client.id}`);
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

    const payload = (color: 'white' | 'black', opponentElo: number) => ({
      gameId:      match.gameId,
      color,
      opponent:    { elo: opponentElo },
      timeControl: match.timeControl,
    });

    // Émettre directement aux sockets par leur ID
    this.server
      .to(match.whiteSocketId)
      .emit('lobby:matchFound', payload('white', match.blackElo));

    this.server
      .to(match.blackSocketId)
      .emit('lobby:matchFound', payload('black', match.whiteElo));

    this.logger.log(
      `Appariement notifié : partie ${match.gameId} ` +
      `(${match.whiteUserId} vs ${match.blackUserId})`,
    );
  }
}
