import { Injectable } from '@nestjs/common';
import { NotificationType } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crée une notification pour un utilisateur (appelé par les autres services). */
  async create(
    userId: string,
    type: NotificationType,
    payload: Record<string, unknown>,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, payload },
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
