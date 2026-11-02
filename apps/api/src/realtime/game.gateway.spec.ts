// ─────────────────────────────────────────────────────────────────────────────
// Sprint 17 — Tests de sécurité de GameGateway (Socket.IO /game)
// ─────────────────────────────────────────────────────────────────────────────
import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ResultReason } from '../common/prisma-enums';
import { SYSTEM_ACTOR } from '../games/game-access';
import { GamesService } from '../games/games.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GameGateway } from './game.gateway';

/** Socket minimal : id, jeton au handshake, émissions enregistrées. */
function fakeSocket(id: string, token?: string) {
  const toEmit = jest.fn();
  return {
    id,
    handshake: { auth: token ? { token } : {} },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    to: jest.fn(() => ({ emit: toEmit })),
    toEmit,
  };
}

const ONLINE_STATE = {
  id: 'g-1',
  mode: 'MATCHMAKING',
  status: 'ONGOING',
  whitePlayerId: 'alice',
  blackPlayerId: 'bob',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
};

describe('GameGateway — sécurité', () => {
  let gateway: GameGateway;
  const games = {
    findById: jest.fn(),
    makeMove: jest.fn(),
    resign: jest.fn(),
    offerDraw: jest.fn(),
    acceptDraw: jest.fn(),
    declineDraw: jest.fn(),
  };
  const jwt = { verify: jest.fn((token: string) => ({ sub: token.replace('jwt-', '') })) };
  const notifications = { notifyGameEnded: jest.fn().mockResolvedValue([]), notifyTurn: jest.fn() };
  const roomEmit = jest.fn();

  /** Connecte un socket (authentifié si `user`) et lui fait rejoindre g-1. */
  async function joined(id: string, user?: string) {
    const socket = fakeSocket(id, user ? `jwt-${user}` : undefined);
    gateway.handleConnection(socket as any);
    await gateway.handleJoin({ gameId: 'g-1' }, socket as any);
    return socket;
  }

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    games.findById.mockResolvedValue(ONLINE_STATE);
    games.resign.mockResolvedValue({ id: 'g-1', result: 'WHITE_WIN', resultReason: 'ABANDONED', whitePlayerId: 'alice', blackPlayerId: 'bob' });
    gateway = new GameGateway(
      games as unknown as GamesService,
      jwt as unknown as JwtService,
      notifications as unknown as NotificationsService,
    );
    gateway.server = { to: jest.fn(() => ({ emit: roomEmit })) } as any;
  });

  afterEach(() => jest.useRealTimers());

  it('game:move transmet l\'identité du handshake au service (et rien d\'autre)', async () => {
    const bob = await joined('s-bob', 'bob');
    games.makeMove.mockRejectedValue(
      new ForbiddenException({ error: 'NOT_YOUR_TURN', message: 'Ce n\'est pas à vous de jouer.' }),
    );

    await gateway.handleMove({ gameId: 'g-1', uci: 'e2e4', timeSpentMs: 0 }, bob as any);

    expect(games.makeMove).toHaveBeenCalledWith('g-1', { uci: 'e2e4', timeSpentMs: 0 }, { userId: 'bob' });
    expect(bob.emit).toHaveBeenCalledWith('game:invalidMove', {
      reason: 'NOT_YOUR_TURN',
      message: 'Ce n\'est pas à vous de jouer.',
      uci: 'e2e4',
    });
    expect(roomEmit).not.toHaveBeenCalledWith('game:moveMade', expect.anything());
  });

  it('socket anonyme : acteur sans identité (le service refusera en ligne)', async () => {
    const anon = await joined('s-anon');
    games.makeMove.mockRejectedValue(new Error('refusé'));
    await gateway.handleMove({ gameId: 'g-1', uci: 'e2e4' }, anon as any);
    expect(games.makeMove.mock.calls[0][2]).toEqual({ userId: undefined });
  });

  it('game:resign ignore la couleur envoyée : l\'acteur est transmis', async () => {
    const bob = await joined('s-bob', 'bob');
    await gateway.handleResign({ gameId: 'g-1', color: 'white' }, bob as any);
    expect(games.resign).toHaveBeenCalledWith('g-1', 'white', { userId: 'bob' });
  });

  it('game:drawOffer refusée par le service → erreur à l\'émetteur, rien relayé', async () => {
    const eve = await joined('s-eve', 'eve');
    games.offerDraw.mockRejectedValue(
      new ForbiddenException({ error: 'NOT_A_PLAYER', message: 'Vous ne participez pas à cette partie.' }),
    );

    await gateway.handleDrawOffer({ gameId: 'g-1' }, eve as any);

    expect(eve.emit).toHaveBeenCalledWith('game:error', {
      error: 'NOT_A_PLAYER',
      message: 'Vous ne participez pas à cette partie.',
    });
    expect(eve.toEmit).not.toHaveBeenCalled();
  });

  it('game:drawOffer valide → relayée à l\'adversaire avec la couleur', async () => {
    const alice = await joined('s-alice', 'alice');
    games.offerDraw.mockResolvedValue('white');
    await gateway.handleDrawOffer({ gameId: 'g-1' }, alice as any);
    expect(alice.toEmit).toHaveBeenCalledWith('game:drawOffered', { by: 'white' });
  });

  // ─── Forfait après déconnexion ─────────────────────────────────────────────

  it('un spectateur qui se déconnecte ne fait perdre personne', async () => {
    const eve = await joined('s-eve', 'eve');
    gateway.handleDisconnect(eve as any);
    await jest.advanceTimersByTimeAsync(31_000);
    expect(games.resign).not.toHaveBeenCalled();
  });

  it('un joueur encore connecté sur un autre onglet ne perd pas', async () => {
    const tab1 = await joined('s-alice-1', 'alice');
    await joined('s-alice-2', 'alice');
    gateway.handleDisconnect(tab1 as any);
    await jest.advanceTimersByTimeAsync(31_000);
    expect(games.resign).not.toHaveBeenCalled();
  });

  it('joueur parti 30 s → forfait par le serveur (ABANDONED) pour SA couleur', async () => {
    const bob = await joined('s-bob', 'bob');
    gateway.handleDisconnect(bob as any);
    expect(bob.toEmit).toHaveBeenCalledWith('game:opponentDisconnected', { graceMs: 30_000 });

    await jest.advanceTimersByTimeAsync(30_000);

    expect(games.resign).toHaveBeenCalledWith('g-1', 'black', SYSTEM_ACTOR, ResultReason.ABANDONED);
    expect(roomEmit).toHaveBeenCalledWith('game:ended', { result: 'WHITE_WIN', reason: 'ABANDONED' });
  });

  it('joueur revenu avant 30 s → pas de forfait', async () => {
    const bob = await joined('s-bob', 'bob');
    gateway.handleDisconnect(bob as any);
    await jest.advanceTimersByTimeAsync(10_000);
    await joined('s-bob-2', 'bob');
    await jest.advanceTimersByTimeAsync(25_000);
    expect(games.resign).not.toHaveBeenCalled();
  });

  it('les deux joueurs partent : deux minuteries distinctes (plus d\'écrasement)', async () => {
    const alice = await joined('s-alice', 'alice');
    const bob = await joined('s-bob', 'bob');
    gateway.handleDisconnect(alice as any);
    gateway.handleDisconnect(bob as any);

    await jest.advanceTimersByTimeAsync(30_000);

    const colors = games.resign.mock.calls.map((c) => c[1]);
    expect(colors).toEqual(['white', 'black']);
  });
});
