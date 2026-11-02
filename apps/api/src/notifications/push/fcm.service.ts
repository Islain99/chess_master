// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Client Firebase Cloud Messaging (API HTTP v1)
//
// Un seul canal pour Android, iOS/macOS (FCM relaie vers APNs) et le Web
// (FCM relaie vers Web Push / VAPID).
//
// Authentification « compte de service » sans SDK :
//   1. JWT signé RS256 avec la clé privée du compte de service ;
//   2. échangé contre un access token OAuth2 (valable 1 h, mis en cache) ;
//   3. POST https://fcm.googleapis.com/v1/projects/<id>/messages:send
//
// Configuration (au choix) :
//   • FCM_SERVICE_ACCOUNT : contenu JSON du compte de service (brut ou base64)
//   • FCM_PROJECT_ID + FCM_CLIENT_EMAIL + FCM_PRIVATE_KEY (\n échappés acceptés)
// Sans configuration, le service est désactivé : aucun envoi, aucune erreur.
// ─────────────────────────────────────────────────────────────────────────────
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { importPKCS8, KeyLike, SignJWT } from 'jose';

export const FCM_FETCH = Symbol('FCM_FETCH');

export type FcmFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

export interface PushMessage {
  title: string;
  body: string;
  /** Données transmises à l'application (valeurs chaînes uniquement, imposé par FCM). */
  data: Record<string, string>;
  /**
   * Web : page ouverte au clic sur la notification. FCM n'accepte qu'une URL
   * HTTPS absolue ; un lien relatif est ignoré (le service worker de
   * l'application gère alors le clic lui-même).
   */
  link?: string;
}

/** Résultat d'un envoi : `invalid-token` → le jeton doit être supprimé. */
export type SendResult = 'sent' | 'invalid-token' | 'failed' | 'disabled';

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

@Injectable()
export class FcmService {
  private readonly logger = new Logger(FcmService.name);
  private readonly account: ServiceAccount | null;
  private readonly fetchFn: FcmFetch;

  private signingKey?: Promise<KeyLike>;
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    config: ConfigService,
    @Optional() @Inject(FCM_FETCH) fetchFn?: FcmFetch,
  ) {
    this.account = readServiceAccount(config);
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
    if (!this.account) {
      this.logger.log('FCM non configuré : notifications push désactivées.');
    }
  }

  get enabled(): boolean {
    return this.account !== null;
  }

  /** Envoie un message à un jeton d'appareil. Ne lève jamais d'exception. */
  async send(token: string, message: PushMessage): Promise<SendResult> {
    if (!this.account) return 'disabled';

    try {
      const accessToken = await this.getAccessToken();
      const res = await this.fetchFn(
        `https://fcm.googleapis.com/v1/projects/${this.account.projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: buildFcmMessage(token, message) }),
        },
      );

      if (res.ok) return 'sent';

      const error = await res.json().catch(() => ({}));
      if (isInvalidToken(res.status, error)) return 'invalid-token';

      // 401 : access token révoqué → on le jettera au prochain appel.
      if (res.status === 401) this.accessToken = undefined;
      this.logger.warn(`FCM ${res.status} : ${error?.error?.message ?? 'erreur inconnue'}`);
      return 'failed';
    } catch (err) {
      this.logger.warn(`Envoi FCM impossible : ${(err as Error).message}`);
      return 'failed';
    }
  }

  // ─── OAuth2 « compte de service » ──────────────────────────────────────────

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && this.accessToken.expiresAt - 60_000 > now) {
      return this.accessToken.value;
    }

    const account = this.account!;
    this.signingKey ??= importPKCS8(account.privateKey, 'RS256');
    const assertion = await new SignJWT({ scope: FCM_SCOPE })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setIssuer(account.clientEmail)
      .setSubject(account.clientEmail)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await this.signingKey);

    const res = await this.fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });
    const json = await res.json();
    if (!res.ok || typeof json?.access_token !== 'string') {
      throw new Error(`échange OAuth2 refusé (${res.status} ${json?.error ?? ''})`);
    }

    this.accessToken = {
      value: json.access_token,
      expiresAt: now + (Number(json.expires_in) || 3600) * 1000,
    };
    return this.accessToken.value;
  }
}

// ─── Construction du message ─────────────────────────────────────────────────

export function buildFcmMessage(token: string, m: PushMessage) {
  return {
    token,
    notification: { title: m.title, body: m.body },
    data: m.data,
    android: {
      priority: 'HIGH',
      notification: { tag: m.data.gameId ?? m.data.type }, // remplace la précédente pour la même partie
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: { aps: { sound: 'default', 'thread-id': m.data.gameId ?? m.data.type } },
    },
    webpush: {
      notification: { icon: '/icons/Icon-192.png', tag: m.data.gameId ?? m.data.type },
      ...(m.link?.startsWith('https://') ? { fcm_options: { link: m.link } } : {}),
    },
  };
}

/**
 * Jeton à supprimer : appareil désinstallé (UNREGISTERED / 404) ou jeton
 * mal formé. Un INVALID_ARGUMENT sans mention du jeton signale plutôt une
 * erreur de contenu → on garde le jeton.
 */
export function isInvalidToken(status: number, error: any): boolean {
  if (status === 404) return true;
  const details: any[] = error?.error?.details ?? [];
  const codes = details.map((d) => d?.errorCode).filter(Boolean);
  if (codes.includes('UNREGISTERED')) return true;
  return (
    status === 400 &&
    (codes.includes('INVALID_ARGUMENT') || error?.error?.status === 'INVALID_ARGUMENT') &&
    /registration token/i.test(error?.error?.message ?? '')
  );
}

// ─── Lecture de la configuration ─────────────────────────────────────────────

function readServiceAccount(config: ConfigService): ServiceAccount | null {
  const raw = config.get<string>('FCM_SERVICE_ACCOUNT')?.trim();
  if (raw) {
    try {
      const json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
      return normalize(json.project_id, json.client_email, json.private_key);
    } catch {
      new Logger(FcmService.name).error('FCM_SERVICE_ACCOUNT illisible (JSON ou base64 attendu).');
      return null;
    }
  }
  return normalize(
    config.get<string>('FCM_PROJECT_ID'),
    config.get<string>('FCM_CLIENT_EMAIL'),
    config.get<string>('FCM_PRIVATE_KEY'),
  );
}

function normalize(projectId?: string, clientEmail?: string, privateKey?: string): ServiceAccount | null {
  if (!projectId || !clientEmail || !privateKey) return null;
  // Les variables d'environnement transportent souvent la clé avec des « \n » littéraux.
  return { projectId, clientEmail, privateKey: privateKey.replace(/\\n/g, '\n') };
}
