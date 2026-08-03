import { Socket } from 'socket.io';

/**
 * Limiteur de débit côté WebSocket.
 * Utilisé dans les gateways pour limiter le nombre d'événements
 * par fenêtre temporelle sans bloquer l'ensemble de la connexion.
 */
export class WsRateLimiter {
  private readonly counters = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Vérifie si le client peut envoyer un événement.
   * @returns true si autorisé, false si la limite est atteinte.
   */
  isAllowed(clientId: string): boolean {
    const now   = Date.now();
    const entry = this.counters.get(clientId);

    if (!entry || now > entry.resetAt) {
      this.counters.set(clientId, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.maxPerWindow) {
      return false;
    }

    entry.count++;
    return true;
  }

  remove(clientId: string): void {
    this.counters.delete(clientId);
  }

  /** Crée un middleware Socket.IO à partir de ce limiteur. */
  asMiddleware() {
    return (socket: Socket, next: (err?: Error) => void) => {
      if (!this.isAllowed(socket.id)) {
        next(new Error('Rate limit dépassé.'));
      } else {
        next();
      }
    };
  }
}

/** Limiteur préconfiguré pour les coups (max 3 coups/seconde). */
export const moveLimiter   = new WsRateLimiter(3,   1_000);

/** Limiteur préconfiguré pour les connexions (max 5/10 s). */
export const connectLimiter = new WsRateLimiter(5, 10_000);
