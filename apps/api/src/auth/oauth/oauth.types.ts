// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Types partagés de la connexion OAuth2 / OpenID Connect
// ─────────────────────────────────────────────────────────────────────────────
import { AuthProvider } from '../../common/prisma-enums';

/** Valeur du paramètre d'URL `POST /auth/oauth/:provider`. */
export enum OAuthProviderParam {
  GOOGLE = 'google',
  APPLE = 'apple',
  FACEBOOK = 'facebook',
}

/** Correspondance paramètre d'URL → valeur stockée en base (User.authProvider). */
export const PROVIDER_TO_AUTH: Record<OAuthProviderParam, AuthProvider> = {
  [OAuthProviderParam.GOOGLE]: AuthProvider.GOOGLE,
  [OAuthProviderParam.APPLE]: AuthProvider.APPLE,
  [OAuthProviderParam.FACEBOOK]: AuthProvider.FACEBOOK,
};

/** Libellé lisible, utilisé dans les messages d'erreur. */
export const PROVIDER_LABEL: Record<string, string> = {
  LOCAL: 'e-mail / mot de passe',
  GOOGLE: 'Google',
  APPLE: 'Apple',
  FACEBOOK: 'Facebook',
};

/**
 * Identité vérifiée renvoyée par un fournisseur.
 * Ne contient que des données dont la signature (ou l'appel serveur à serveur)
 * a été validée : jamais de champ recopié tel quel depuis le client, sauf
 * `displayName` pour Apple (Apple ne transmet le nom qu'au client).
 */
export interface OAuthProfile {
  provider: AuthProvider;
  /** Identifiant stable chez le fournisseur (`sub` OIDC, `id` Facebook). */
  providerId: string;
  email: string | null;
  /** Le fournisseur garantit que l'adresse appartient à l'utilisateur. */
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
}
