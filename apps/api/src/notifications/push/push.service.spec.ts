// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Tests de PushService et des textes de notification
// ─────────────────────────────────────────────────────────────────────────────
import { ConfigService } from '@nestjs/config';
import { NotificationType, PushPlatform } from '../../common/prisma-enums';
import { PrismaService } from '../../prisma/prisma.service';
import { FcmService } from './fcm.service';
import { renderPushMessage } from './push-messages';
import { MAX_DEVICES_PER_USER, PushService } from './push.service';

const prisma = {
  pushDevice: {
    upsert: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};
const fcm = { enabled: true, send: jest.fn() };

function makeService(env: Record<string, string> = {}) {
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new PushService(prisma as unknown as PrismaService, fcm as unknown as FcmService, config);
}

beforeEach(() => {
  jest.clearAllMocks();
  fcm.enabled = true;
});

describe('PushService — appareils', () => {
  it('enregistre le jeton (upsert : un jeton = un seul compte)', async () => {
    prisma.pushDevice.findMany.mockResolvedValue([]);

    await makeService().registerDevice('u-1', 'tok-1', PushPlatform.ANDROID);

    expect(prisma.pushDevice.upsert).toHaveBeenCalledWith({
      where: { token: 'tok-1' },
      create: { userId: 'u-1', token: 'tok-1', platform: PushPlatform.ANDROID },
      update: { userId: 'u-1', platform: PushPlatform.ANDROID, lastSeenAt: expect.any(Date) },
    });
    expect(prisma.pushDevice.deleteMany).not.toHaveBeenCalled();
  });

  it(`au-delà de ${MAX_DEVICES_PER_USER} appareils, retire les moins récents`, async () => {
    prisma.pushDevice.findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);

    await makeService().registerDevice('u-1', 'tok-new', PushPlatform.WEB);

    expect(prisma.pushDevice.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      orderBy: { lastSeenAt: 'desc' },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['old-1', 'old-2'] } } });
  });

  it('désinscription limitée aux jetons de l\'utilisateur', async () => {
    await makeService().unregisterDevice('u-1', 'tok-1');
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1', token: 'tok-1' } });
  });
});

describe('PushService — envoi', () => {
  const notification = { id: 'n-1', type: NotificationType.YOUR_TURN, payload: { gameId: 'g-1', lastMove: 'e4' } };

  it('envoie à chaque appareil et supprime les jetons invalides', async () => {
    prisma.pushDevice.findMany.mockResolvedValue([{ token: 'ok' }, { token: 'dead' }, { token: 'flaky' }]);
    fcm.send.mockImplementation(async (token: string) =>
      token === 'ok' ? 'sent' : token === 'dead' ? 'invalid-token' : 'failed',
    );

    const res = await makeService().sendToUser('u-1', notification);

    expect(fcm.send).toHaveBeenCalledTimes(3);
    expect(fcm.send.mock.calls[0][1]).toMatchObject({ title: 'À vous de jouer ♟', body: 'Votre adversaire a joué e4.' });
    expect(prisma.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ['dead'] } } });
    expect(res).toEqual({ sent: 1, removed: 1 });
  });

  it('lien de clic : absolu si PUBLIC_WEB_URL est défini, absent sinon', async () => {
    prisma.pushDevice.findMany.mockResolvedValue([{ token: 'ok' }]);
    fcm.send.mockResolvedValue('sent');

    await makeService({ PUBLIC_WEB_URL: 'https://chess.example.com/' }).sendToUser('u-1', notification);
    expect(fcm.send.mock.calls[0][1].link).toBe('https://chess.example.com/?game=g-1');

    await makeService().sendToUser('u-1', notification);
    expect(fcm.send.mock.calls[1][1].link).toBeUndefined();
  });

  it('aucun appareil → aucun envoi', async () => {
    prisma.pushDevice.findMany.mockResolvedValue([]);
    await expect(makeService().sendToUser('u-1', notification)).resolves.toEqual({ sent: 0, removed: 0 });
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it('FCM désactivé → aucune requête en base', async () => {
    fcm.enabled = false;
    await makeService().sendToUser('u-1', notification);
    expect(prisma.pushDevice.findMany).not.toHaveBeenCalled();
  });

  it('erreur base de données → avalée (le jeu continue)', async () => {
    prisma.pushDevice.findMany.mockRejectedValue(new Error('DB down'));
    await expect(makeService().sendToUser('u-1', notification)).resolves.toEqual({ sent: 0, removed: 0 });
  });
});

describe('renderPushMessage', () => {
  it('YOUR_TURN avec et sans dernier coup', () => {
    expect(renderPushMessage(NotificationType.YOUR_TURN, { gameId: 'g', lastMove: 'Nf3' }, 'n').body).toBe(
      'Votre adversaire a joué Nf3.',
    );
    expect(renderPushMessage(NotificationType.YOUR_TURN, { gameId: 'g' }, 'n').body).toBe(
      'Votre adversaire a joué.',
    );
  });

  it('GAME_ENDED : titre selon l\'issue, motif traduit', () => {
    const win = renderPushMessage(NotificationType.GAME_ENDED, { gameId: 'g', outcome: 'win', reason: 'CHECKMATE' }, 'n');
    expect(win.title).toBe('Victoire ! 🏆');
    expect(win.body).toBe("Partie terminée (échec et mat). Consultez l'analyse.");
    expect(renderPushMessage(NotificationType.GAME_ENDED, { outcome: 'loss' }, 'n').title).toBe('Défaite');
    expect(renderPushMessage(NotificationType.GAME_ENDED, { outcome: 'draw' }, 'n').title).toBe('Partie nulle');
  });

  it('GAME_INVITE mentionne le code de salle', () => {
    expect(renderPushMessage(NotificationType.GAME_INVITE, { roomCode: 'K7Q2' }, 'n').body).toContain('K7Q2');
  });

  it('SYSTEM utilise titre et message fournis', () => {
    const m = renderPushMessage(NotificationType.SYSTEM, { title: 'Maintenance', message: 'Ce soir 22 h.' }, 'n');
    expect(m).toMatchObject({ title: 'Maintenance', body: 'Ce soir 22 h.' });
  });

  it('data : chaînes uniquement, identifiants utiles, lien vers la partie', () => {
    const m = renderPushMessage(NotificationType.GAME_ENDED, { gameId: 'g-9', result: 'DRAW', extra: { x: 1 } }, 'n-5');
    expect(m.data).toEqual({ type: 'GAME_ENDED', notificationId: 'n-5', gameId: 'g-9', result: 'DRAW' });
    expect(Object.values(m.data).every((v) => typeof v === 'string')).toBe(true);
    expect(m.link).toBe('/?game=g-9');
  });
});
