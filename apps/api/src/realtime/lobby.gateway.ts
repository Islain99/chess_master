import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/lobby', cors: { origin: '*' } })
export class LobbyGateway {
  @SubscribeMessage('lobby:joinQueue')
  handleJoinQueue(
    @MessageBody() _data: { timeControl: string },
    @ConnectedSocket() _client: Socket,
  ) {
    // TODO sprint 7 : enregistrer dans MatchmakingQueueEntry et declencher
    // l'appariement par Elo.
  }
}
