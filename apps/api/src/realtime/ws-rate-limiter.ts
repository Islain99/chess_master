/**
 * Rate limiter pour les événements WebSocket.
 * Empêche les bots d'envoyer des coups trop rapidement.
 *
 * Utilisation : appeler checkMove(socketId) avant de traiter game:move.
 * Retourne false si la limite est dépassée.
 */

interface RateBucket {
  count:     number;
  windowEnd: number;
}

export class WsRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();
  private readonly windowMs:   number;
  private readonly maxPerWindow: number;

  /** @param windowMs     durée de la fenêtre en ms (défaut : 5 000)  */
  /** @param maxPerWindow max de coups par fenêtre (défaut : 20)      */
  constructor(windowMs = 5_000, maxPerWindow = 20) {
    this.windowMs      = windowMs;
    this.maxPerWindow  = maxPerWindow;
  }

  /**
   * Vérifie si socketId peut émettre un événement supplémentaire.
   * Retourne true si autorisé, false si limite atteinte.
   */
  check(socketId: string): boolean {
    const now    = Date.now();
    const bucket = this.buckets.get(socketId);

    if (!bucket || now >= bucket.windowEnd) {
      this.buckets.set(socketId, { count: 1, windowEnd: now + this.windowMs });
      return true;
    }

    if (bucket.count >= this.maxPerWindow) return false;
    bucket.count++;
    return true;
  }

  /** Libère le bucket d'un socket déconnecté. */
  remove(socketId: string): void {
    this.buckets.delete(socketId);
  }

  /** Nettoyage périodique des fenêtres expirées. */
  purgeExpired(): void {
    const now = Date.now();
    for (const [id, b] of this.buckets.entries()) {
      if (now >= b.windowEnd) this.buckets.delete(id);
    }
  }
}
