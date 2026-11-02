import { IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

/**
 * Sprint 15 — Corps de `POST /auth/oauth/:provider`.
 *
 * Le client obtient un jeton auprès du fournisseur avec son SDK natif
 * (Google Sign-In, Sign in with Apple, Facebook Login) puis l'échange ici
 * contre une paire de jetons Chess Master. Le serveur ne fait jamais
 * confiance au client : le jeton est revérifié (signature, émetteur,
 * audience, expiration).
 */
export class OAuthLoginDto {
  /**
   * Google : ID token (JWT) · Apple : identity token (JWT) ·
   * Facebook : access token, ou authentication token (JWT « Limited Login » iOS).
   */
  @IsString()
  @MinLength(10)
  @MaxLength(8192)
  token: string;

  /**
   * Apple et Facebook Limited Login : nonce brut généré par le client.
   * Le jeton contient son empreinte SHA-256 → protège contre le rejeu.
   */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  nonce?: string;

  /**
   * Apple ne transmet le nom de l'utilisateur qu'au client, et seulement à la
   * première connexion : le client le relaie ici. Ignoré pour Google/Facebook.
   */
  @IsOptional()
  @IsString()
  @Length(2, 32)
  displayName?: string;
}
