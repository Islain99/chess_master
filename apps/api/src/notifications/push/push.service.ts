// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Registre des appareils et diffusion des notifications push
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationType, PushPlatform } from '../../common/prisma-enums';
import { MetricsService } from '../../metrics/metrics.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmService } from './fcm.service';
import { NotificationPayload, renderPushMessage } from './push-messages';

/** Nombre maximal d'appareils conservés par compte (les plus anciens sont retirés). */
export const MAX_DEVICES_PER_USER = 10;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  /** URL publique du client Web (PUBLIC_WEB_URL) : base des liens de clic. */
  private readonly webBaseUrl: string | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly fcm: FcmService,
    @Optional() config?: ConfigService,
    // Sprint 19 : compteur chess_api_push_notifications_total{result}.
    @Optional() private readonly metrics?: MetricsService,
  ) {
    const base = config?.get<string>('PUBLIC_WEB_URL')?.trim().replace(/\/+$/, '');
    this.webBaseUrl = base || null;
  }

  get enabled(): boolean {
    return this.fcm.enabled;
  }

  // ─── Appareils ─────────────────────────────────────────────────────────────

  /**
   * Enregistre (ou rafraîchit) le jeton FCM d'un appareil.
   * Un jeton déjà connu change de propriétaire : sur un appareil partagé,
   * seul le dernier compte connecté reçoit les notifications.
   */
  async registerDevice(userId: string, token: string, platform: PushPlatform): Promise<void> {
    await this.prisma.pushDevice.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });

    // Limiter le nombre d'appareils : on retire les moins récemment vus.
    const stale = await this.prisma.pushDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.pushDevice.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
    }
  }

  /** Désinscrit un appareil (déconnexion ou refus des notifications). */
  async unregisterDevice(userId: string, token: string): Promise<void> {
    await this.prisma.pushDevice.deleteMany({ where: { userId, token } });
  }

  // ─── Envoi ─────────────────────────────────────────────────────────────────

  /**
   * Envoie la notification à tous les appareils de l'utilisateur.
   * Les jetons signalés invalides par FCM sont supprimés au passage.
   * Ne lève jamais d'exception : un échec push ne doit pas bloquer le jeu.
   */
  async sendToUser(
    userId: string,
    notification: { id: string; type: NotificationType; payload: NotificationPayload },
  ): Promise<{ sent: number; removed: number }> {
    if (!this.fcm.enabled) return { sent: 0, removed: 0 };

    try {
      const devices = await this.prisma.pushDevice.findMany({
        where: { userId },
        select: { token: true },
      });
      if (devices.length === 0) return { sent: 0, removed: 0 };

      const message = renderPushMessage(notification.type, notification.payload, notification.id);
      // Lien absolu pour le Web (sinon FCM refuserait le message entier).
      message.link = this.webBaseUrl && message.link ? `${this.webBaseUrl}${message.link}` : undefined;
      const results = await Promise.all(devices.map((d) => this.fcm.send(d.token, message)));

      for (const r of results) this.metrics?.pushResult(r);
      const invalid = devices.filter((_, i) => results[i] === 'invalid-token').map((d) => d.token);
      if (invalid.length > 0) {
        await this.prisma.pushDevice.deleteMany({ where: { token: { in: invalid } } });
      }
      return { sent: results.filter((r) => r === 'sent').length, removed: invalid.length };
    } catch (err) {
      this.logger.warn(`Push vers ${userId} impossible : ${(err as Error).message}`);
      return { sent: 0, removed: 0 };
    }
  }
}
