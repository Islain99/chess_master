// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Vérification côté serveur des jetons Google, Apple et Facebook
//
// Flux « échange de jeton » (adapté aux applications mobiles/desktop) :
//   1. le client Flutter s'authentifie avec le SDK natif du fournisseur ;
//   2. il envoie le jeton obtenu à POST /auth/oauth/:provider ;
//   3. ce service valide le jeton AUPRÈS DU FOURNISSEUR :
//        • Google / Apple / Facebook Limited Login : JWT OpenID Connect signé
//          (RS256) → signature vérifiée avec les clés publiques (JWKS) du
//          fournisseur, puis émetteur, audience et expiration ;
//        • Facebook (access token classique) : appel serveur à serveur
//          /debug_token signé avec le secret d'application ;
//   4. AuthService crée/retrouve le compte et émet nos propres JWT.
//
// Les clés JWKS sont mises en cache par `jose` (createRemoteJWKSet) et
// renouvelées automatiquement en cas de rotation.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { createRemoteJWKSet, jwtVerify, JWTPayload, JWTVerifyGetKey } from 'jose';
import { AuthProvider } from '../../common/prisma-enums';
import { OAuthLoginDto } from '../dto/oauth-login.dto';
import { OAuthProfile, OAuthProviderParam } from './oauth.types';

/** Jeton d'injection : résolveurs de clés (remplacés par des clés locales en test). */
export const OAUTH_KEY_RESOLVERS = Symbol('OAUTH_KEY_RESOLVERS');
/** Jeton d'injection : implémentation de fetch (simulée en test). */
export const OAUTH_FETCH = Symbol('OAUTH_FETCH');

export type KeyedProvider = 'google' | 'apple' | 'facebook';
export type OAuthKeyResolvers = Partial<Record<KeyedProvider, JWTVerifyGetKey>>;
export type FetchFn = (url: string) => Promise<{ ok: boolean; json(): Promise<any> }>;

const JWKS_URL: Record<KeyedProvider, string> = {
  google: 'https://www.googleapis.com/oauth2/v3/certs',
  apple: 'https://appleid.apple.com/auth/keys',
  facebook: 'https://limited.facebook.com/.well-known/oauth/openid/jwks/',
};

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const APPLE_ISSUER = 'https://appleid.apple.com';
const FACEBOOK_ISSUER = 'https://www.facebook.com';
const GRAPH_URL = 'https://graph.facebook.com';

/** Tolérance d'horloge entre notre serveur et le fournisseur. */
const CLOCK_TOLERANCE_SEC = 30;

@Injectable()
export class OAuthVerifierService {
  private readonly logger = new Logger(OAuthVerifierService.name);
  private readonly keys: OAuthKeyResolvers;
  private readonly fetchFn: FetchFn;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(OAUTH_KEY_RESOLVERS) keys?: OAuthKeyResolvers,
    @Optional() @Inject(OAUTH_FETCH) fetchFn?: FetchFn,
  ) {
    this.keys = { ...(keys ?? {}) };
    this.fetchFn = fetchFn ?? ((url: string) => fetch(url));
  }

  /** Point d'entrée : valide le jeton du fournisseur et renvoie l'identité. */
  async verify(provider: OAuthProviderParam, dto: OAuthLoginDto): Promise<OAuthProfile> {
    switch (provider) {
      case OAuthProviderParam.GOOGLE:
        return this.verifyGoogle(dto.token);
      case OAuthProviderParam.APPLE:
        return this.verifyApple(dto.token, dto.nonce, dto.displayName);
      case OAuthProviderParam.FACEBOOK:
        return looksLikeJwt(dto.token)
          ? this.verifyFacebookLimited(dto.token, dto.nonce)
          : this.verifyFacebookAccessToken(dto.token);
    }
  }

  // ─── Google ────────────────────────────────────────────────────────────────

  /**
   * ID token Google. L'audience doit être l'un de NOS client IDs OAuth
   * (Web, Android « serverClientId », iOS, macOS) — sinon un jeton émis pour
   * une autre application serait accepté.
   */
  async verifyGoogle(idToken: string): Promise<OAuthProfile> {
    const audience = this.list('GOOGLE_CLIENT_IDS', 'Google');
    const payload = await this.verifyJwt('google', idToken, {
      issuer: GOOGLE_ISSUERS,
      audience,
      label: 'Google',
    });

    return {
      provider: AuthProvider.GOOGLE,
      providerId: requireSub(payload, 'Google'),
      email: asString(payload.email),
      emailVerified: asBool(payload.email_verified),
      displayName: asString(payload.name),
      avatarUrl: asString(payload.picture),
    };
  }

  // ─── Apple ─────────────────────────────────────────────────────────────────

  /**
   * Identity token « Sign in with Apple ».
   * Audience : bundle ID (iOS/macOS) ou Services ID (Android/Web).
   * Nonce : le client envoie SHA-256(nonce brut) à Apple et le nonce brut ici.
   */
  async verifyApple(
    identityToken: string,
    rawNonce?: string,
    displayNameHint?: string,
  ): Promise<OAuthProfile> {
    const audience = this.list('APPLE_CLIENT_IDS', 'Apple');
    const payload = await this.verifyJwt('apple', identityToken, {
      issuer: APPLE_ISSUER,
      audience,
      label: 'Apple',
    });

    if (payload.nonce !== undefined || rawNonce !== undefined) {
      const expected = rawNonce ? sha256Hex(rawNonce) : undefined;
      if (!expected || payload.nonce !== expected) {
        throw new UnauthorizedException('Jeton Apple invalide (nonce).');
      }
    }

    return {
      provider: AuthProvider.APPLE,
      providerId: requireSub(payload, 'Apple'),
      email: asString(payload.email),
      emailVerified: asBool(payload.email_verified),
      displayName: displayNameHint?.trim() || null,
      avatarUrl: null, // Apple ne fournit pas de photo
    };
  }

  // ─── Facebook ──────────────────────────────────────────────────────────────

  /**
   * Access token Facebook classique (Android, Web, iOS avec suivi autorisé).
   * 1. /debug_token avec le jeton d'application → le jeton est-il valide et
   *    émis pour NOTRE application ?
   * 2. /me (avec appsecret_proof) → profil.
   */
  async verifyFacebookAccessToken(accessToken: string): Promise<OAuthProfile> {
    const { appId, appSecret } = this.facebookCredentials();

    const debug = await this.getJson(
      `${GRAPH_URL}/debug_token?` +
        new URLSearchParams({ input_token: accessToken, access_token: `${appId}|${appSecret}` }),
    );
    const info = debug?.data;
    if (!info?.is_valid || String(info.app_id) !== appId || !info.user_id) {
      throw new UnauthorizedException('Jeton Facebook invalide.');
    }

    const me = await this.getJson(
      `${GRAPH_URL}/me?` +
        new URLSearchParams({
          fields: 'id,name,email,picture.type(large)',
          access_token: accessToken,
          appsecret_proof: createHmac('sha256', appSecret).update(accessToken).digest('hex'),
        }),
    );
    if (!me?.id || String(me.id) !== String(info.user_id)) {
      throw new UnauthorizedException('Jeton Facebook invalide.');
    }

    const picture = me.picture?.data;
    return {
      provider: AuthProvider.FACEBOOK,
      providerId: String(me.id),
      email: asString(me.email),
      // Facebook ne renvoie que des adresses confirmées par l'utilisateur.
      emailVerified: Boolean(me.email),
      displayName: asString(me.name),
      avatarUrl: picture && !picture.is_silhouette ? asString(picture.url) : null,
    };
  }

  /**
   * « Limited Login » (iOS quand l'utilisateur refuse le suivi ATT) :
   * le SDK renvoie un JWT OIDC signé par Facebook au lieu d'un access token.
   * Nonce : comparé tel quel (Facebook n'applique pas de hachage).
   */
  async verifyFacebookLimited(authToken: string, rawNonce?: string): Promise<OAuthProfile> {
    const { appId } = this.facebookCredentials();
    const payload = await this.verifyJwt('facebook', authToken, {
      issuer: FACEBOOK_ISSUER,
      audience: [appId],
      label: 'Facebook',
    });

    if (payload.nonce !== undefined || rawNonce !== undefined) {
      if (!rawNonce || payload.nonce !== rawNonce) {
        throw new UnauthorizedException('Jeton Facebook invalide (nonce).');
      }
    }

    return {
      provider: AuthProvider.FACEBOOK,
      providerId: requireSub(payload, 'Facebook'),
      email: asString(payload.email),
      emailVerified: Boolean(payload.email),
      displayName: asString(payload.name),
      avatarUrl: asString(payload.picture),
    };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async verifyJwt(
    provider: KeyedProvider,
    token: string,
    opts: { issuer: string | string[]; audience: string[]; label: string },
  ): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.keyResolver(provider), {
        issuer: opts.issuer,
        audience: opts.audience,
        algorithms: ['RS256'],
        clockTolerance: CLOCK_TOLERANCE_SEC,
      });
      return payload;
    } catch (err) {
      this.logger.warn(`Jeton ${opts.label} rejeté : ${(err as Error).message}`);
      throw new UnauthorizedException(`Jeton ${opts.label} invalide ou expiré.`);
    }
  }

  /** Résolveur JWKS distant créé à la première utilisation puis mis en cache. */
  private keyResolver(provider: KeyedProvider): JWTVerifyGetKey {
    if (!this.keys[provider]) {
      this.keys[provider] = createRemoteJWKSet(new URL(JWKS_URL[provider]));
    }
    return this.keys[provider]!;
  }

  private async getJson(url: string): Promise<any> {
    try {
      const res = await this.fetchFn(url);
      return await res.json();
    } catch (err) {
      this.logger.error(`Appel Graph API impossible : ${(err as Error).message}`);
      throw new ServiceUnavailableException('Facebook est momentanément injoignable.');
    }
  }

  private facebookCredentials() {
    const appId = this.config.get<string>('FACEBOOK_APP_ID')?.trim();
    const appSecret = this.config.get<string>('FACEBOOK_APP_SECRET')?.trim();
    if (!appId || !appSecret) {
      throw new ServiceUnavailableException('La connexion Facebook n\'est pas configurée.');
    }
    return { appId, appSecret };
  }

  /** Lit une variable d'environnement « a,b,c » ; vide → fournisseur désactivé. */
  private list(key: string, label: string): string[] {
    const values = (this.config.get<string>(key) ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) {
      throw new ServiceUnavailableException(`La connexion ${label} n'est pas configurée.`);
    }
    return values;
  }
}

// ─── Fonctions utilitaires ───────────────────────────────────────────────────

function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Apple encode parfois les booléens en chaînes ("true"). */
function asBool(value: unknown): boolean {
  return value === true || value === 'true';
}

function requireSub(payload: JWTPayload, label: string): string {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new UnauthorizedException(`Jeton ${label} invalide (sujet manquant).`);
  }
  return payload.sub;
}
