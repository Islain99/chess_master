import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Sprint 17 — Garde JWT FACULTATIVE.
 *
 * Laisse passer toutes les requêtes ; si un jeton d'accès valide est fourni,
 * `req.user` est renseigné, sinon il reste `undefined`. Utilisée par les
 * routes /games : les parties locales restent anonymes, tandis que
 * GamesService exige l'identité pour les parties en ligne.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Ne jamais rejeter : absence ou invalidité du jeton → requête anonyme.
  handleRequest<TUser = unknown>(_err: unknown, user: TUser | false): TUser | undefined {
    return user || undefined;
  }
}
