// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Textes des notifications push (français)
// ─────────────────────────────────────────────────────────────────────────────
import { NotificationType } from '../../common/prisma-enums';
import { PushMessage } from './fcm.service';

/** Charge utile d'une notification (colonne JSON Notification.payload). */
export type NotificationPayload = Record<string, unknown>;

const REASON_LABEL: Record<string, string> = {
  CHECKMATE: 'échec et mat',
  RESIGNATION: 'abandon',
  TIMEOUT: 'temps écoulé',
  STALEMATE: 'pat',
  THREEFOLD_REPETITION: 'triple répétition',
  FIFTY_MOVE_RULE: 'règle des 50 coups',
  INSUFFICIENT_MATERIAL: 'matériel insuffisant',
  DRAW_AGREEMENT: 'nulle acceptée',
  ABANDONED: 'déconnexion',
};

/**
 * Transforme une notification stockée en message push.
 * `data` reprend le type et les identifiants utiles à l'application pour
 * ouvrir le bon écran au toucher (valeurs converties en chaînes pour FCM).
 */
export function renderPushMessage(
  type: NotificationType,
  payload: NotificationPayload,
  notificationId: string,
): PushMessage {
  const data: Record<string, string> = { type, notificationId };
  for (const key of ['gameId', 'roomCode', 'result', 'reason', 'outcome']) {
    const value = payload[key];
    if (value !== undefined && value !== null) data[key] = String(value);
  }
  const link = data.gameId ? `/?game=${encodeURIComponent(data.gameId)}` : '/';

  switch (type) {
    case NotificationType.YOUR_TURN: {
      const san = typeof payload.lastMove === 'string' ? payload.lastMove : null;
      return {
        title: 'À vous de jouer ♟',
        body: san ? `Votre adversaire a joué ${san}.` : 'Votre adversaire a joué.',
        data,
        link,
      };
    }

    case NotificationType.GAME_ENDED: {
      const outcome = payload.outcome;
      const title =
        outcome === 'win' ? 'Victoire ! 🏆' : outcome === 'loss' ? 'Défaite' : 'Partie nulle';
      const reason = REASON_LABEL[String(payload.reason)] ?? null;
      return {
        title,
        body: reason ? `Partie terminée (${reason}). Consultez l'analyse.` : 'Partie terminée.',
        data,
        link,
      };
    }

    case NotificationType.GAME_INVITE: {
      const room = typeof payload.roomCode === 'string' ? ` ${payload.roomCode}` : '';
      return {
        title: 'Votre adversaire est arrivé',
        body: `Un joueur a rejoint votre salle${room}. La partie commence !`,
        data,
        link,
      };
    }

    case NotificationType.SYSTEM:
    default:
      return {
        title: typeof payload.title === 'string' ? payload.title : 'Chess Master',
        body: typeof payload.message === 'string' ? payload.message : 'Nouvelle notification.',
        data,
        link,
      };
  }
}
