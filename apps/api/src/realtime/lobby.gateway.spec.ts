// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Tests de LobbyGateway (Socket.IO /lobby)
//
// Services simulés : on vérifie le contrat d'événements (docs/websocket-events.md)
// et les règles : matchmaking réservé aux comptes, retrait de la file à la
// déconnexion, notification des deux joueurs, salles privées.
// ─────────────────────────────────────────────────────────────────────────────
import { JwtService } from '@nestjs/jwt';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { MetricsService } from '../metrics/metrics.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RatingsService } from '../ratings/ratings.service';
import { RoomsService } from '../rooms/rooms.service';
import { LobbyGateway } from './lobby.gateway';

function fakeSocket(id: string, token?: string) {
  return {
    id,
    handshake: { auth: token ? { token } : {} },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    leave: jest.fn().mockResolvedValue(undefined),
  } as any;
}

const MATCH = {
  gameId: 'g-42',
  whiteUserId: 'alice', blackUserId: 'bob',
  whiteSocketId: 's-alice', blackSocketId: 's-bob',
  whiteElo: 1510, blackElo: 1490,
  whiteName: 'Alice', blackName: 'Bob',
  timeControl: 'BLITZ',
};

describe('LobbyGateway', () => {
  const rooms = { create: jest.fn(), join: jest.fn() };
  const matchmaking = {
    enqueue: jest.fn(),
    dequeue: jest.fn(),
    dequeueSocket: jest.fn(),
    getStatus: jest.fn(),
    periodicCheck: jest.fn(),
  };
  const ratings = { getElo: jest.fn().mockResolvedValue(1500) };
  const jwt = {
    verify: jest.fn((t: string) => {
      if (!t.startsWith('jwt-')) throw new Error('invalid');
      return { sub: t.slice(4) };
    }),
  };
  const notifications = { notifyRoomJoined: jest.fn().mockResolvedValue(undefined) };
  const metrics = { wsConnected: jest.fn(), wsDisconnected: jest.fn() };
  const emitTo = new Map<string, jest.Mock>();
  let gateway: LobbyGateway;

  /** server.to(cible).emit(...) → enregistré par cible. */
  const emitted = (target: string) => emitTo.get(target) ?? jest.fn();

  function connect(id: string, user?: string) {
    const socket = fakeSocket(id, user ? `jwt-${user}` : undefined);
    gateway.handleConnection(socket);
    return socket;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    emitTo.clear();
    gateway = new LobbyGateway(
      rooms as unknown as RoomsService,
      matchmaking as unknown as MatchmakingService,
      ratings as unknown as RatingsService,
      jwt as unknown as JwtService,
      notifications as unknown as NotificationsService,
      metrics as unknown as MetricsService,
    );
    gateway.server = {
      to: jest.fn((target: string) => {
        const emit = emitTo.get(target) ?? jest.fn();
        emitTo.set(target, emit);
        return { emit };
      }),
    } as any;
  });

  afterEach(() => gateway.onModuleDestroy());

  describe('connexion', () => {
    it('jeton valide → socket identifié ; jeton invalide → anonyme', async () => {
      const alice = connect('s-alice', 'alice');
      const anon = fakeSocket('s-anon', 'pas-un-jwt');
      gateway.handleConnection(anon);

      expect(alice.userId).toBe('alice');
      expect(anon.userId).toBeUndefined();
      expect(metrics.wsConnected).toHaveBeenCalledTimes(2);
    });
  });

  describe('lobby:joinQueue', () => {
    it('anonyme : refusé (lobby:error), rien en file', async () => {
      const anon = connect('s-anon');
      await gateway.handleJoinQueue({ timeControl: 'BLITZ' as any }, anon);

      expect(anon.emit).toHaveBeenCalledWith('lobby:error', {
        message: 'Authentification requise pour le matchmaking.',
      });
      expect(matchmaking.enqueue).not.toHaveBeenCalled();
    });

    it('inscrit avec l\'Elo de la cadence et l\'identifiant du socket', async () => {
      matchmaking.enqueue.mockResolvedValue(null);
      const alice = connect('s-alice', 'alice');

      await gateway.handleJoinQueue({ timeControl: 'BLITZ' as any }, alice);

      expect(ratings.getElo).toHaveBeenCalledWith('alice', 'BLITZ');
      expect(alice.emit).toHaveBeenCalledWith('lobby:queued', expect.objectContaining({ timeControl: 'BLITZ', elo: 1500 }));
      expect(matchmaking.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'alice', socketId: 's-alice', elo: 1500, timeControl: 'BLITZ' }),
      );
    });

    it('cadence par défaut : RAPID', async () => {
      matchmaking.enqueue.mockResolvedValue(null);
      await gateway.handleJoinQueue({}, connect('s-alice', 'alice'));
      expect(ratings.getElo).toHaveBeenCalledWith('alice', 'RAPID');
    });

    it('appariement : chaque joueur reçoit sa couleur, le nom et l\'Elo de l\'adversaire', async () => {
      matchmaking.enqueue.mockResolvedValue(MATCH);

      await gateway.handleJoinQueue({ timeControl: 'BLITZ' as any }, connect('s-bob', 'bob'));

      expect(emitted('s-alice')).toHaveBeenCalledWith('lobby:matchFound', {
        gameId: 'g-42', color: 'white', opponent: { elo: 1490, displayName: 'Bob' }, timeControl: 'BLITZ',
      });
      expect(emitted('s-bob')).toHaveBeenCalledWith('lobby:matchFound', {
        gameId: 'g-42', color: 'black', opponent: { elo: 1510, displayName: 'Alice' }, timeControl: 'BLITZ',
      });
    });
  });

  describe('lobby:leaveQueue', () => {
    it('en attente : retiré de la file, confirmation envoyée', async () => {
      matchmaking.getStatus.mockResolvedValue({ status: 'waiting', timeControl: 'BLITZ' });
      const alice = connect('s-alice', 'alice');

      await gateway.handleLeaveQueue(alice);

      expect(matchmaking.dequeue).toHaveBeenCalledWith('alice', 'BLITZ');
      expect(alice.leave).toHaveBeenCalledWith('lobby:queue:BLITZ');
      expect(alice.emit).toHaveBeenCalledWith('lobby:leftQueue');
    });

    it('pas en file : confirmation sans retrait', async () => {
      matchmaking.getStatus.mockResolvedValue({ status: 'not_in_queue' });
      const alice = connect('s-alice', 'alice');
      await gateway.handleLeaveQueue(alice);
      expect(matchmaking.dequeue).not.toHaveBeenCalled();
      expect(alice.emit).toHaveBeenCalledWith('lobby:leftQueue');
    });
  });

  describe('déconnexion (sprint 20)', () => {
    it('joueur identifié : retiré de la file s\'il y avait été inscrit par ce socket', async () => {
      matchmaking.dequeueSocket.mockResolvedValue(true);
      const alice = connect('s-alice', 'alice');

      await gateway.handleDisconnect(alice);

      expect(matchmaking.dequeueSocket).toHaveBeenCalledWith('alice', 's-alice');
      expect(metrics.wsDisconnected).toHaveBeenCalledWith('lobby');
    });

    it('anonyme : rien à retirer', async () => {
      await gateway.handleDisconnect(connect('s-anon'));
      expect(matchmaking.dequeueSocket).not.toHaveBeenCalled();
    });

    it('erreur Redis : avalée (la déconnexion ne doit jamais planter)', async () => {
      matchmaking.dequeueSocket.mockRejectedValue(new Error('Redis down'));
      await expect(gateway.handleDisconnect(connect('s-alice', 'alice'))).resolves.toBeUndefined();
    });
  });

  describe('salles privées', () => {
    it('lobby:createRoom → code et partie renvoyés au créateur', async () => {
      rooms.create.mockResolvedValue({ roomCode: 'ABC123', gameId: 'g-1' });
      const alice = connect('s-alice', 'alice');

      await gateway.handleCreateRoom({ timeControl: 'BLITZ' as any }, alice);

      expect(rooms.create).toHaveBeenCalledWith('BLITZ', 'alice');
      expect(alice.emit).toHaveBeenCalledWith('lobby:roomCreated', { roomCode: 'ABC123', gameId: 'g-1' });
    });

    it('lobby:joinRoom → confirmation, hôte prévenu (socket + notification)', async () => {
      const game = { id: 'g-1', roomCode: 'ABC123', whitePlayerId: 'alice', blackPlayerId: 'bob' };
      rooms.join.mockResolvedValue(game);
      const bob = connect('s-bob', 'bob');

      await gateway.handleJoinRoom({ roomCode: 'ABC123' }, bob);

      expect(bob.emit).toHaveBeenCalledWith('lobby:roomJoined', { gameId: 'g-1', roomCode: 'ABC123' });
      expect(emitted('lobby:waiting:ABC123')).toHaveBeenCalledWith('lobby:opponentJoined', { gameId: 'g-1' });
      expect(notifications.notifyRoomJoined).toHaveBeenCalledWith(game);
    });

    it('code invalide → lobby:error avec le message du service', async () => {
      rooms.join.mockRejectedValue(new Error('Salle introuvable.'));
      const bob = connect('s-bob', 'bob');
      await gateway.handleJoinRoom({ roomCode: 'NOPE' }, bob);
      expect(bob.emit).toHaveBeenCalledWith('lobby:error', { message: 'Salle introuvable.' });
    });

    it('lobby:waitRoom → l\'hôte rejoint la room d\'attente', async () => {
      const alice = connect('s-alice', 'alice');
      await gateway.handleWaitRoom({ roomCode: 'ABC123' }, alice);
      expect(alice.join).toHaveBeenCalledWith('lobby:waiting:ABC123');
      expect(alice.emit).toHaveBeenCalledWith('lobby:waiting', { roomCode: 'ABC123' });
    });
  });

  describe('appariement périodique', () => {
    it('toutes les 10 s : chaque cadence est vérifiée et les paires notifiées', async () => {
      jest.useFakeTimers();
      try {
        matchmaking.periodicCheck.mockImplementation(async (tc: string) => (tc === 'BLITZ' ? [MATCH] : []));
        gateway.afterInit();

        await jest.advanceTimersByTimeAsync(10_000);

        expect(matchmaking.periodicCheck.mock.calls.map((c) => c[0]).sort()).toEqual(
          ['BLITZ', 'BULLET', 'CLASSICAL', 'RAPID'],
        );
        expect(emitted('s-alice')).toHaveBeenCalledWith('lobby:matchFound', expect.objectContaining({ gameId: 'g-42' }));
      } finally {
        gateway.onModuleDestroy();
        jest.useRealTimers();
      }
    });

    it('une cadence en erreur n\'empêche pas les autres', async () => {
      jest.useFakeTimers();
      try {
        matchmaking.periodicCheck.mockImplementation(async (tc: string) => {
          if (tc === 'BULLET') throw new Error('boom');
          return tc === 'RAPID' ? [MATCH] : [];
        });
        gateway.afterInit();
        await jest.advanceTimersByTimeAsync(10_000);
        expect(emitted('s-bob')).toHaveBeenCalledWith('lobby:matchFound', expect.objectContaining({ color: 'black' }));
      } finally {
        gateway.onModuleDestroy();
        jest.useRealTimers();
      }
    });
  });
});
