import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GamesService } from '../games/games.service';

@WebSocketGateway({ namespace: '/game', cors: { origin: '*' } })
export class GameGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gamesService: GamesService) {}

  handleConnection(_client: Socket) {
    // TODO sprint 6 : valider le JWT dans client.handshake.auth.token
  }

  /** Le client rejoint la room d'une partie et reçoit l'état complet */
  @SubscribeMessage('game:join')
  async handleJoin(
    @MessageBody() data: { gameId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(`game:${data.gameId}`);
    try {
      const state = await this.gamesService.findById(data.gameId);
      client.emit('game:state', state);
    } catch {
      client.emit('game:error', { message: 'Partie introuvable.' });
    }
  }

  /** Coup reçu via WebSocket — validé par chess.js avant diffusion */
  @SubscribeMessage('game:move')
  async handleMove(
    @MessageBody() data: { gameId: string; uci: string; timeSpentMs?: number },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const result = await this.gamesService.makeMove(data.gameId, {
        uci: data.uci,
        timeSpentMs: data.timeSpentMs,
      });
      // Diffuser le coup validé à tous les joueurs de la room
      this.server.to(`game:${data.gameId}`).emit('game:moveMade', result);

      if (result.game.status === 'FINISHED') {
        this.server
          .to(`game:${data.gameId}`)
          .emit('game:ended', {
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

  /** Abandon via WebSocket */
  @SubscribeMessage('game:resign')
  async handleResign(
    @MessageBody() data: { gameId: string; color: 'white' | 'black' },
    @ConnectedSocket() _client: Socket,
  ) {
    const game = await this.gamesService.resign(data.gameId, data.color);
    this.server.to(`game:${data.gameId}`).emit('game:ended', {
      result: game.result,
      reason: game.resultReason,
    });
  }
}
