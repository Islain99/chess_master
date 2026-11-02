// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Tests de FcmService (OAuth2 compte de service + API HTTP v1)
//
// Une vraie clé RSA est générée : on vérifie que l'assertion envoyée à Google
// est un JWT RS256 valide, signé avec la clé du compte de service.
// ─────────────────────────────────────────────────────────────────────────────
import { ConfigService } from '@nestjs/config';
import { exportPKCS8, generateKeyPair, jwtVerify, KeyLike } from 'jose';
import { buildFcmMessage, FcmFetch, FcmService, isInvalidToken } from './fcm.service';

let publicKey: KeyLike;
let pkcs8: string;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256', { extractable: true });
  publicKey = pair.publicKey;
  pkcs8 = await exportPKCS8(pair.privateKey);
});

const message = {
  title: 'À vous de jouer ♟',
  body: 'Votre adversaire a joué Nf3.',
  data: { type: 'YOUR_TURN', gameId: 'game-1', notificationId: 'n-1' },
  link: 'https://chess.example.com/?game=game-1',
};

function serviceAccountEnv() {
  return {
    FCM_PROJECT_ID: 'chess-master',
    FCM_CLIENT_EMAIL: 'push@chess-master.iam.gserviceaccount.com',
    // Clé avec « \n » littéraux, comme dans un fichier .env
    FCM_PRIVATE_KEY: pkcs8.replace(/\n/g, '\\n'),
  };
}

/** fetch simulé : jeton OAuth2 puis réponses FCM successives. */
function fakeFetch(fcmResponses: Array<{ status: number; body?: unknown }>) {
  const queue = [...fcmResponses];
  return jest.fn<ReturnType<FcmFetch>, Parameters<FcmFetch>>(async (url) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      return { ok: true, status: 200, json: async () => ({ access_token: 'ya29.token', expires_in: 3600 }) };
    }
    const next = queue.shift() ?? { status: 200, body: { name: 'projects/x/messages/1' } };
    return { ok: next.status < 300, status: next.status, json: async () => next.body ?? {} };
  });
}

function makeService(env: Record<string, string>, fetchFn?: FcmFetch) {
  return new FcmService({ get: (k: string) => env[k] } as unknown as ConfigService, fetchFn);
}

describe('FcmService', () => {
  it('sans configuration : désactivé, aucun appel réseau', async () => {
    const fetchFn = fakeFetch([]);
    const service = makeService({}, fetchFn);

    expect(service.enabled).toBe(false);
    await expect(service.send('token', message)).resolves.toBe('disabled');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('obtient un access token avec une assertion JWT signée, puis envoie le message', async () => {
    const fetchFn = fakeFetch([{ status: 200 }]);
    const service = makeService(serviceAccountEnv(), fetchFn);

    await expect(service.send('device-token-123', message)).resolves.toBe('sent');

    // 1) Échange OAuth2
    const [tokenUrl, tokenInit] = fetchFn.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(tokenInit.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const { payload } = await jwtVerify(form.get('assertion')!, publicKey, {
      issuer: 'push@chess-master.iam.gserviceaccount.com',
      audience: 'https://oauth2.googleapis.com/token',
    });
    expect(payload.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');

    // 2) Envoi FCM v1
    const [sendUrl, sendInit] = fetchFn.mock.calls[1];
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/chess-master/messages:send');
    expect(sendInit.headers.Authorization).toBe('Bearer ya29.token');
    expect(JSON.parse(sendInit.body).message).toEqual(buildFcmMessage('device-token-123', message));
  });

  it('réutilise l\'access token en cache pour les envois suivants', async () => {
    const fetchFn = fakeFetch([{ status: 200 }, { status: 200 }, { status: 200 }]);
    const service = makeService(serviceAccountEnv(), fetchFn);

    await service.send('a', message);
    await service.send('b', message);
    await service.send('c', message);

    const tokenCalls = fetchFn.mock.calls.filter(([url]) => url.includes('oauth2'));
    expect(tokenCalls).toHaveLength(1);
    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('accepte FCM_SERVICE_ACCOUNT en JSON base64', async () => {
    const json = JSON.stringify({
      project_id: 'from-json',
      client_email: 'sa@from-json.iam.gserviceaccount.com',
      private_key: pkcs8,
    });
    const fetchFn = fakeFetch([{ status: 200 }]);
    const service = makeService({ FCM_SERVICE_ACCOUNT: Buffer.from(json).toString('base64') }, fetchFn);

    expect(service.enabled).toBe(true);
    await service.send('t', message);
    expect(fetchFn.mock.calls[1][0]).toContain('/projects/from-json/');
  });

  it('jeton désinscrit (UNREGISTERED) → invalid-token', async () => {
    const fetchFn = fakeFetch([
      {
        status: 404,
        body: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } },
      },
    ]);
    await expect(makeService(serviceAccountEnv(), fetchFn).send('old', message)).resolves.toBe(
      'invalid-token',
    );
  });

  it('erreur serveur FCM → failed (le jeton est conservé)', async () => {
    const fetchFn = fakeFetch([{ status: 503, body: { error: { message: 'Unavailable' } } }]);
    await expect(makeService(serviceAccountEnv(), fetchFn).send('t', message)).resolves.toBe('failed');
  });

  it('échange OAuth2 refusé → failed, sans exception', async () => {
    const fetchFn = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) }));
    await expect(makeService(serviceAccountEnv(), fetchFn).send('t', message)).resolves.toBe('failed');
  });
});

describe('isInvalidToken', () => {
  it('404 → invalide', () => expect(isInvalidToken(404, {})).toBe(true));

  it('400 INVALID_ARGUMENT sur le jeton → invalide', () => {
    expect(
      isInvalidToken(400, {
        error: { status: 'INVALID_ARGUMENT', message: 'The registration token is not a valid FCM registration token' },
      }),
    ).toBe(true);
  });

  it('400 INVALID_ARGUMENT sur le contenu → jeton conservé', () => {
    expect(
      isInvalidToken(400, { error: { status: 'INVALID_ARGUMENT', message: 'Invalid JSON payload received.' } }),
    ).toBe(false);
  });

  it('401 / 500 → jeton conservé', () => {
    expect(isInvalidToken(401, {})).toBe(false);
    expect(isInvalidToken(500, {})).toBe(false);
  });
});

describe('buildFcmMessage', () => {
  it('regroupe les notifications d\'une même partie (tag / thread-id)', () => {
    const m = buildFcmMessage('t', message);
    expect(m.android.notification.tag).toBe('game-1');
    expect(m.apns.payload.aps['thread-id']).toBe('game-1');
    expect(m.webpush.notification.tag).toBe('game-1');
    expect(m.webpush.fcm_options).toEqual({ link: 'https://chess.example.com/?game=game-1' });
  });

  it('lien relatif ou HTTP : fcm_options omis (FCM exige HTTPS)', () => {
    expect(buildFcmMessage('t', { ...message, link: '/?game=game-1' }).webpush).not.toHaveProperty('fcm_options');
    expect(buildFcmMessage('t', { ...message, link: 'http://x/' }).webpush).not.toHaveProperty('fcm_options');
  });
});
