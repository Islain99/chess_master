// ─────────────────────────────────────────────────────────────────────────────
// Sprint 16 — Tests de NotificationsService (création + événements de partie)
// ─────────────────────────────────────────────────────────────────────────────
import { NotificationType } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { PushService } from './push/push.service';

const prisma = { notification: { create: jest.fn() } };
const push = { sendToUser: jest.fn() };

function makeService() {
  return new NotificationsService(prisma as unknown as PrismaService, push as unknown as PushService);
}

/** Laisse s'exécuter les envois push lancés en arrière-plan. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  prisma.notification.create.mockImplementation(async ({ data }) => ({ id: `n-${++n}`, ...data }));
  push.sendToUser.mockResolvedValue({ sent: 1, removed: 0 });
});

describe('NotificationsService.create', () => {
  it('enregistre la notification puis l\'envoie en push', async () => {
    const created = await makeService().create('u-1', NotificationType.SYSTEM, { message: 'Bienvenue' });
    await flush();

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'u-1', type: NotificationType.SYSTEM, payload: { message: 'Bienvenue' } },
    });
    expect(push.sendToUser).toHaveBeenCalledWith('u-1', {
      id: created.id,
      type: NotificationType.SYSTEM,
      payload: { message: 'Bienvenue' },
    });
  });

  it('push: false → notification in-app seulement', async () => {
    await makeService().create('u-1', NotificationType.SYSTEM, {}, { push: false });
    await flush();
    expect(push.sendToUser).not.toHaveBeenCalled();
  });

  it('un échec push ne fait pas échouer la création', async () => {
    push.sendToUser.mockRejectedValue(new Error('FCM down'));
    await expect(makeService().create('u-1', NotificationType.SYSTEM, {})).resolves.toMatchObject({ id: 'n-1' });
    await flush();
  });
});

describe('NotificationsService.notifyTurn', () => {
  const game = { id: 'g-1', whitePlayerId: 'alice', blackPlayerId: 'bob' };
  const blackToMove = { ...game, fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' };

  it('prévient le joueur au trait s\'il ne regarde pas la partie', async () => {
    await makeService().notifyTurn(blackToMove, 'e4', () => false);

    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'bob', type: NotificationType.YOUR_TURN, payload: { gameId: 'g-1', lastMove: 'e4' } },
    });
  });

  it('ne fait rien si le joueur au trait suit la partie en direct', async () => {
    await expect(makeService().notifyTurn(blackToMove, 'e4', (uid) => uid === 'bob')).resolves.toBeNull();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('trait aux blancs → prévient les blancs', async () => {
    const whiteToMove = { ...game, fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2' };
    await makeService().notifyTurn(whiteToMove, 'e5', () => false);
    expect(prisma.notification.create.mock.calls[0][0].data.userId).toBe('alice');
  });

  it('joueur au trait anonyme ou IA → aucune notification', async () => {
    await expect(
      makeService().notifyTurn({ ...blackToMove, blackPlayerId: null }, 'e4', () => false),
    ).resolves.toBeNull();
  });
});

describe('NotificationsService.notifyGameEnded', () => {
  it('une notification par joueur, issue calculée, push seulement aux absents', async () => {
    await makeService().notifyGameEnded(
      { id: 'g-1', whitePlayerId: 'alice', blackPlayerId: 'bob', result: 'WHITE_WIN', resultReason: 'CHECKMATE' },
      (uid) => uid === 'alice', // Alice regarde encore la partie
    );
    await flush();

    const payloads = prisma.notification.create.mock.calls.map((c) => [c[0].data.userId, c[0].data.payload.outcome]);
    expect(payloads).toEqual([
      ['alice', 'win'],
      ['bob', 'loss'],
    ]);
    // Push uniquement pour Bob (n-2)
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(push.sendToUser.mock.calls[0][0]).toBe('bob');
  });

  it('partie nulle contre l\'IA : seul le joueur humain est notifié', async () => {
    await makeService().notifyGameEnded(
      { id: 'g-2', whitePlayerId: 'alice', blackPlayerId: null, result: 'DRAW', resultReason: 'STALEMATE' },
      () => false,
    );
    expect(prisma.notification.create).toHaveBeenCalledTimes(1);
    expect(prisma.notification.create.mock.calls[0][0].data.payload).toEqual({
      gameId: 'g-2',
      result: 'DRAW',
      reason: 'STALEMATE',
      outcome: 'draw',
    });
  });
});

describe('NotificationsService.notifyRoomJoined', () => {
  it('prévient l\'hôte (blancs) avec le code de salle', async () => {
    await makeService().notifyRoomJoined({ id: 'g-3', whitePlayerId: 'host', blackPlayerId: 'guest', roomCode: 'K7Q2' });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'host', type: NotificationType.GAME_INVITE, payload: { gameId: 'g-3', roomCode: 'K7Q2' } },
    });
  });
});
