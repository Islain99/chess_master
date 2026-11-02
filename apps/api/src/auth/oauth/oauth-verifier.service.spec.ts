// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Tests de OAuthVerifierService
//
// On génère une vraie paire de clés RSA et on signe de vrais JWT avec `jose` :
// la vérification cryptographique est donc réellement exercée. Seuls les
// JWKS distants (remplacés par un JWKS local) et l'API Graph de Facebook
// (fetch simulé) sont remplacés.
// ─────────────────────────────────────────────────────────────────────────────
import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { createLocalJWKSet, exportJWK, generateKeyPair, JWTPayload, KeyLike, SignJWT } from 'jose';
import { AuthProvider } from '../../common/prisma-enums';
import { FetchFn, OAuthVerifierService } from './oauth-verifier.service';
import { OAuthProviderParam } from './oauth.types';

const GOOGLE_CLIENT = 'web-client.apps.googleusercontent.com';
const APPLE_BUNDLE = 'com.islain99.chessClient';
const FB_APP_ID = '1234567890';
const FB_SECRET = 'fb-app-secret';

const ENV: Record<string, string> = {
  GOOGLE_CLIENT_IDS: `${GOOGLE_CLIENT}, android-client.apps.googleusercontent.com`,
  APPLE_CLIENT_IDS: APPLE_BUNDLE,
  FACEBOOK_APP_ID: FB_APP_ID,
  FACEBOOK_APP_SECRET: FB_SECRET,
};

let privateKey: KeyLike;
let otherKey: KeyLike;
let jwks: ReturnType<typeof createLocalJWKSet>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
  jwks = createLocalJWKSet({ keys: [jwk] });
});

/** Signe un JWT de test (RS256, kid connu, expiration 10 min par défaut). */
function sign(
  claims: JWTPayload,
  opts: { iss: string; aud: string; key?: KeyLike; expiresIn?: string | number },
) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(opts.iss)
    .setAudience(opts.aud)
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? '10m')
    .sign(opts.key ?? privateKey);
}

function makeService(env: Record<string, string> = ENV, fetchFn?: FetchFn) {
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new OAuthVerifierService(
    config,
    { google: jwks, apple: jwks, facebook: jwks },
    fetchFn ?? jest.fn(),
  );
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

// ─── Google ──────────────────────────────────────────────────────────────────

describe('OAuthVerifierService — Google', () => {
  const iss = 'https://accounts.google.com';

  it('accepte un ID token valide et extrait le profil', async () => {
    const token = await sign(
      { sub: 'g-123', email: 'alice@gmail.com', email_verified: true, name: 'Alice', picture: 'https://pic' },
      { iss, aud: GOOGLE_CLIENT },
    );

    const profile = await makeService().verify(OAuthProviderParam.GOOGLE, { token });

    expect(profile).toEqual({
      provider: AuthProvider.GOOGLE,
      providerId: 'g-123',
      email: 'alice@gmail.com',
      emailVerified: true,
      displayName: 'Alice',
      avatarUrl: 'https://pic',
    });
  });

  it('accepte le second client ID configuré (Android)', async () => {
    const token = await sign({ sub: 'g-1' }, { iss, aud: 'android-client.apps.googleusercontent.com' });
    await expect(makeService().verifyGoogle(token)).resolves.toMatchObject({ providerId: 'g-1' });
  });

  it('accepte l\'émetteur sans schéma « accounts.google.com »', async () => {
    const token = await sign({ sub: 'g-2' }, { iss: 'accounts.google.com', aud: GOOGLE_CLIENT });
    await expect(makeService().verifyGoogle(token)).resolves.toMatchObject({ providerId: 'g-2' });
  });

  it('rejette un jeton émis pour une autre application (audience)', async () => {
    const token = await sign({ sub: 'g-1' }, { iss, aud: 'autre-app.apps.googleusercontent.com' });
    await expect(makeService().verifyGoogle(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un mauvais émetteur', async () => {
    const token = await sign({ sub: 'g-1' }, { iss: 'https://evil.example.com', aud: GOOGLE_CLIENT });
    await expect(makeService().verifyGoogle(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette une signature faite avec une autre clé', async () => {
    const token = await sign({ sub: 'g-1' }, { iss, aud: GOOGLE_CLIENT, key: otherKey });
    await expect(makeService().verifyGoogle(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un jeton expiré (au-delà de la tolérance d\'horloge)', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    const token = await sign({ sub: 'g-1' }, { iss, aud: GOOGLE_CLIENT, expiresIn: past });
    await expect(makeService().verifyGoogle(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un texte qui n\'est pas un JWT', async () => {
    await expect(makeService().verifyGoogle('pas-un-jwt-du-tout')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('email_verified absent → adresse non vérifiée', async () => {
    const token = await sign({ sub: 'g-3', email: 'x@gmail.com' }, { iss, aud: GOOGLE_CLIENT });
    const profile = await makeService().verifyGoogle(token);
    expect(profile.emailVerified).toBe(false);
  });

  it('fournisseur non configuré → 503', async () => {
    const token = await sign({ sub: 'g-1' }, { iss, aud: GOOGLE_CLIENT });
    await expect(makeService({}).verifyGoogle(token)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

// ─── Apple ───────────────────────────────────────────────────────────────────

describe('OAuthVerifierService — Apple', () => {
  const iss = 'https://appleid.apple.com';

  it('accepte un identity token avec nonce correct et relaie le nom fourni par le client', async () => {
    const rawNonce = 'nonce-brut-aléatoire';
    const token = await sign(
      { sub: 'a-001', email: 'relay@privaterelay.appleid.com', email_verified: 'true', nonce: sha256(rawNonce) },
      { iss, aud: APPLE_BUNDLE },
    );

    const profile = await makeService().verify(OAuthProviderParam.APPLE, {
      token,
      nonce: rawNonce,
      displayName: '  Bob  ',
    });

    expect(profile).toEqual({
      provider: AuthProvider.APPLE,
      providerId: 'a-001',
      email: 'relay@privaterelay.appleid.com',
      emailVerified: true, // "true" (chaîne) accepté
      displayName: 'Bob',
      avatarUrl: null,
    });
  });

  it('rejette un nonce qui ne correspond pas', async () => {
    const token = await sign({ sub: 'a-1', nonce: sha256('bon') }, { iss, aud: APPLE_BUNDLE });
    await expect(makeService().verifyApple(token, 'mauvais')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejette un jeton portant un nonce quand le client n\'en fournit pas', async () => {
    const token = await sign({ sub: 'a-1', nonce: sha256('x') }, { iss, aud: APPLE_BUNDLE });
    await expect(makeService().verifyApple(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepte un jeton sans nonce si le client n\'en envoie pas', async () => {
    const token = await sign({ sub: 'a-2' }, { iss, aud: APPLE_BUNDLE });
    await expect(makeService().verifyApple(token)).resolves.toMatchObject({ providerId: 'a-2' });
  });

  it('rejette un jeton Google présenté comme jeton Apple', async () => {
    const token = await sign({ sub: 'a-1' }, { iss: 'https://accounts.google.com', aud: APPLE_BUNDLE });
    await expect(makeService().verifyApple(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

// ─── Facebook ────────────────────────────────────────────────────────────────

describe('OAuthVerifierService — Facebook (access token)', () => {
  /** fetch simulé : réponses /debug_token puis /me. */
  function graph(debug: unknown, me: unknown) {
    return jest.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.includes('/debug_token') ? debug : me),
    }));
  }

  it('valide le jeton via /debug_token puis lit /me avec appsecret_proof', async () => {
    const fetchFn = graph(
      { data: { is_valid: true, app_id: FB_APP_ID, user_id: 'fb-42' } },
      {
        id: 'fb-42',
        name: 'Carla',
        email: 'carla@example.com',
        picture: { data: { url: 'https://fb/pic', is_silhouette: false } },
      },
    );

    const profile = await makeService(ENV, fetchFn).verify(OAuthProviderParam.FACEBOOK, {
      token: 'EAAB-access-token',
    });

    expect(profile).toEqual({
      provider: AuthProvider.FACEBOOK,
      providerId: 'fb-42',
      email: 'carla@example.com',
      emailVerified: true,
      displayName: 'Carla',
      avatarUrl: 'https://fb/pic',
    });

    const [debugUrl, meUrl] = fetchFn.mock.calls.map((c) => new URL(c[0]));
    expect(debugUrl.searchParams.get('access_token')).toBe(`${FB_APP_ID}|${FB_SECRET}`);
    expect(meUrl.searchParams.get('appsecret_proof')).toBe(
      createHmac('sha256', FB_SECRET).update('EAAB-access-token').digest('hex'),
    );
  });

  it('rejette un jeton émis pour une autre application', async () => {
    const fetchFn = graph({ data: { is_valid: true, app_id: '999', user_id: 'fb-1' } }, {});
    await expect(
      makeService(ENV, fetchFn).verifyFacebookAccessToken('EAAB-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette un jeton invalide ou révoqué', async () => {
    const fetchFn = graph({ data: { is_valid: false } }, {});
    await expect(
      makeService(ENV, fetchFn).verifyFacebookAccessToken('EAAB-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejette si /me renvoie un autre utilisateur que /debug_token', async () => {
    const fetchFn = graph(
      { data: { is_valid: true, app_id: FB_APP_ID, user_id: 'fb-1' } },
      { id: 'fb-2', name: 'Intrus' },
    );
    await expect(
      makeService(ENV, fetchFn).verifyFacebookAccessToken('EAAB-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('photo par défaut (silhouette) ignorée, pas d\'e-mail → non vérifié', async () => {
    const fetchFn = graph(
      { data: { is_valid: true, app_id: FB_APP_ID, user_id: 'fb-7' } },
      { id: 'fb-7', name: 'Dan', picture: { data: { url: 'https://fb/default', is_silhouette: true } } },
    );
    const profile = await makeService(ENV, fetchFn).verifyFacebookAccessToken('EAAB-token');
    expect(profile.avatarUrl).toBeNull();
    expect(profile.email).toBeNull();
    expect(profile.emailVerified).toBe(false);
  });

  it('Graph API injoignable → 503', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('ECONNRESET');
    });
    await expect(
      makeService(ENV, fetchFn).verifyFacebookAccessToken('EAAB-token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('secret d\'application absent → 503', async () => {
    await expect(
      makeService({ FACEBOOK_APP_ID: FB_APP_ID }).verifyFacebookAccessToken('EAAB-token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('OAuthVerifierService — Facebook Limited Login (JWT iOS)', () => {
  const iss = 'https://www.facebook.com';

  it('un JWT est vérifié comme jeton OIDC, sans appel Graph API', async () => {
    const fetchFn = jest.fn();
    const token = await sign(
      { sub: 'fb-oidc-1', name: 'Eve', email: 'eve@example.com', nonce: 'n-123' },
      { iss, aud: FB_APP_ID },
    );

    const profile = await makeService(ENV, fetchFn).verify(OAuthProviderParam.FACEBOOK, {
      token,
      nonce: 'n-123',
    });

    expect(profile).toMatchObject({ providerId: 'fb-oidc-1', email: 'eve@example.com', emailVerified: true });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('rejette un nonce différent', async () => {
    const token = await sign({ sub: 'fb-1', nonce: 'n-1' }, { iss, aud: FB_APP_ID });
    await expect(makeService().verifyFacebookLimited(token, 'n-2')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
