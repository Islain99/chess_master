import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotificationType } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push/push.service';

/** Vue minimale d'une partie, commune à GamesService.toResponse et au modèle Prisma. */
export interface GameForNotification {
  id: string;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
  result?: string | null;
  resultReason?: string | null;
  roomCode?: string | null;
}

/** Indique si un utilisateur suit actuellement la partie (socket ouvert). */
export type PresenceCheck = (userId: string) => boolean;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
  ) {}

  /**
   * Crée une notification (visible dans l'application) et, sauf `push: false`,
   * l'envoie sur les appareils de l'utilisateur. L'envoi push est lancé en
   * arrière-plan : il ne ralentit ni ne fait échouer l'appelant.
   */
  async create(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
    options: { push?: boolean } = {},
  ) {
    const notification = await this.prisma.notification.create({
      // Sprint 15 : Record<string, unknown> n'est pas un InputJsonValue pour Prisma.
      data: { userId, type, payload: payload as Prisma.InputJsonValue },
    });

    if (options.push !== false) {
      void this.push
        .sendToUser(userId, { id: notification.id, type, payload })
        .catch((err) => this.logger.warn(`Push ignoré : ${err}`));
    }
    return notification;
  }

  // ─── Événements de partie (sprint 16) ──────────────────────────────────────

  /**
   * Après un coup en ligne : prévient le joueur au trait, UNIQUEMENT s'il ne
   * suit pas la partie (sinon il voit déjà le coup arriver en direct).
   */
  async notifyTurn(
    game: GameForNotification & { fen: string },
    lastMove: string | undefined,
    isPresent: PresenceCheck,
  ) {
    const toMove = game.fen.split(' ')[1] === 'b' ? game.blackPlayerId : game.whitePlayerId;
    if (!toMove || isPresent(toMove)) return null;
    return this.create(toMove, NotificationType.YOUR_TURN, {
      gameId: game.id,
      ...(lastMove ? { lastMove } : {}),
    });
  }

  /**
   * Fin de partie : une notification pour chaque joueur humain (historique),
   * poussée sur ses appareils seulement s'il n'est plus dans la partie.
   */
  async notifyGameEnded(game: GameForNotification, isPresent: PresenceCheck) {
    const players: Array<[string | null, 'white' | 'black']> = [
      [game.whitePlayerId, 'white'],
      [game.blackPlayerId, 'black'],
    ];
    const created: Awaited<ReturnType<NotificationsService['create']>>[] = [];
    for (const [userId, color] of players) {
      if (!userId) continue;
      created.push(
        await this.create(
          userId,
          NotificationType.GAME_ENDED,
          {
            gameId: game.id,
            result: game.result ?? null,
            reason: game.resultReason ?? null,
            outcome: outcomeFor(color, game.result),
          },
          { push: !isPresent(userId) },
        ),
      );
    }
    return created;
  }

  /** Salle privée : l'hôte apprend qu'un adversaire l'a rejointe. */
  async notifyRoomJoined(game: GameForNotification) {
    if (!game.whitePlayerId) return null;
    return this.create(game.whitePlayerId, NotificationType.GAME_INVITE, {
      gameId: game.id,
      roomCode: game.roomCode ?? null,
    });
  }

  /** Liste les notifications d'un utilisateur (non lues en premier). */
  async list(userId: string, page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where:   { userId },
        orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId } }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Marque une notification comme lue. */
  async markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data:  { isRead: true },
    });
  }

  /** Marque toutes les notifications comme lues. */
  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data:  { isRead: true },
    });
  }

  /** Nombre de notifications non lues. */
  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }
}

function outcomeFor(color: 'white' | 'black', result?: string | null): 'win' | 'loss' | 'draw' {
  if (result === 'WHITE_WIN') return color === 'white' ? 'win' : 'loss';
  if (result === 'BLACK_WIN') return color === 'black' ? 'win' : 'loss';
  return 'draw';
}
