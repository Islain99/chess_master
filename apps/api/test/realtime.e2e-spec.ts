// ─────────────────────────────────────────────────────────────────────────────
// E2E — Temps réel : matchmaking → partie classée jusqu'au mat → Elo
//
// Tout passe par de vrais clients Socket.IO (/lobby puis /game), comme dans
// l'application Flutter. Sprint 20.
// ─────────────────────────────────────────────────────────────────────────────
import {
  bearer, closeSockets, connectSocket, eventually, expectNoEvent, FOOLS_MATE,
  joinGame, matchPlayers, playMove, registerUser, RunningApp, startApp, waitFor,
} from './e2e-utils';

describe('Temps réel (e2e)', () => {
  let target: RunningApp;

  beforeAll(async () => {
    target = await startApp();
  });

  afterEach(() => closeSockets());
  afterAll(() => target?.close());

  const ratingOf = async (userId: string, tc = 'BLITZ') => {
    const res = await target.api().get(`/api/v1/users/${userId}/ratings`).expect(200);
    return res.body.find((r: any) => r.timeControl === tc);
  };

  it('partie classée complète : appariement, coups diffusés, mat, Elo et statistiques', async () => {
    const [alice, bob] = await Promise.all([registerUser(target, 'rt-alice'), registerUser(target, 'rt-bob')]);

    const { gameId, white, black, found } = await matchPlayers({ target, user: alice }, { target, user: bob });
    expect(found[alice.id]).toMatchObject({ opponent: { elo: 1200, displayName: bob.displayName }, timeControl: 'BLITZ' });
    expect(found[bob.id].opponent.displayName).toBe(alice.displayName);
    expect([white.color, black.color]).toEqual(['white', 'black']);

    const w = await joinGame(target, gameId, white.user);
    const b = await joinGame(target, gameId, black.user);
    expect(w.state).toMatchObject({ id: gameId, mode: 'MATCHMAKING', status: 'ONGOING', playerColor: 'white' });
    expect(b.state.playerColor).toBe('black');

    const sockets = [w.socket, b.socket];
    const ended = sockets.map((s) => waitFor(s, 'game:ended'));
    const movers = [w.socket, b.socket, w.socket, b.socket];
    for (const [i, uci] of FOOLS_MATE.entries()) {
      await playMove(movers[i], gameId, uci, sockets);
    }

    for (const payload of await Promise.all(ended)) {
      expect(payload).toEqual({ result: 'BLACK_WIN', reason: 'CHECKMATE' });
    }

    // Elo recalculé de façon asynchrone : K = 40 pour les 30 premières parties
    const winner = await eventually(async () => {
      const r = await ratingOf(black.user.id);
      expect(r).toBeDefined();
      return r;
    });
    const loser = await ratingOf(white.user.id);
    expect(winner).toMatchObject({ elo: 1220, gamesPlayed: 1, wins: 1 });
    expect(loser).toMatchObject({ elo: 1180, gamesPlayed: 1, losses: 1 });

    const stats = await target.api().get(`/api/v1/users/${black.user.id}/statistics`)
      .set(bearer(black.user)).expect(200);
    expect(stats.body).toMatchObject({ totalGames: 1, totalWins: 1 });
  });

  it('coups refusés en direct : mauvais tour et spectateur ne touchent pas la partie', async () => {
    const [alice, bob] = await Promise.all([registerUser(target, 'rt-carol'), registerUser(target, 'rt-dan')]);
    const { gameId, white, black } = await matchPlayers({ target, user: alice }, { target, user: bob });
    const w = await joinGame(target, gameId, white.user);
    const b = await joinGame(target, gameId, black.user);
    const spectator = await joinGame(target, gameId); // anonyme
    expect(spectator.state.playerColor).toBeNull();

    // Les noirs tentent de jouer en premier
    const refused = waitFor(b.socket, 'game:invalidMove');
    const silence = expectNoEvent(w.socket, 'game:moveMade', 600);
    b.socket.emit('game:move', { gameId, uci: 'e7e5' });
    expect(await refused).toMatchObject({ reason: 'NOT_YOUR_TURN', uci: 'e7e5' });
    await silence;

    // Le spectateur ne peut pas jouer
    const anon = waitFor(spectator.socket, 'game:invalidMove');
    spectator.socket.emit('game:move', { gameId, uci: 'e2e4' });
    expect(await anon).toMatchObject({ reason: 'AUTH_REQUIRED' });

    // Mais il voit les coups des joueurs
    await playMove(w.socket, gameId, 'e2e4', [w.socket, b.socket, spectator.socket]);
  });

  it('nulle par accord : proposition, refus, nouvelle proposition, acceptation → Elo inchangé', async () => {
    const [alice, bob] = await Promise.all([registerUser(target, 'rt-ella'), registerUser(target, 'rt-fred')]);
    const { gameId, white, black } = await matchPlayers({ target, user: alice }, { target, user: bob });
    const w = await joinGame(target, gameId, white.user);
    const b = await joinGame(target, gameId, black.user);

    // Refus
    let offered = waitFor(b.socket, 'game:drawOffered');
    w.socket.emit('game:drawOffer', { gameId });
    expect(await offered).toEqual({ by: 'white' });
    const declined = waitFor(w.socket, 'game:drawDeclined');
    b.socket.emit('game:drawResponse', { gameId, accept: false });
    await declined;

    // Accepter une proposition déjà refusée : impossible
    const err = waitFor(b.socket, 'game:error');
    b.socket.emit('game:drawResponse', { gameId, accept: true });
    expect(await err).toMatchObject({ error: 'NO_DRAW_OFFER' });

    // Nouvelle proposition, acceptée
    offered = waitFor(w.socket, 'game:drawOffered');
    b.socket.emit('game:drawOffer', { gameId });
    expect(await offered).toEqual({ by: 'black' });
    const ended = [w.socket, b.socket].map((s) => waitFor(s, 'game:ended'));
    w.socket.emit('game:drawResponse', { gameId, accept: true });
    for (const payload of await Promise.all(ended)) {
      expect(payload).toEqual({ result: 'DRAW', reason: 'DRAW_AGREEMENT' });
    }

    const r = await eventually(async () => {
      const rating = await ratingOf(white.user.id);
      expect(rating).toBeDefined();
      return rating;
    });
    expect(r).toMatchObject({ elo: 1200, gamesPlayed: 1, draws: 1 });
  });

  it('abandon en direct : l\'adversaire gagne, les deux sont prévenus', async () => {
    const [alice, bob] = await Promise.all([registerUser(target, 'rt-gus'), registerUser(target, 'rt-hana')]);
    const { gameId, white, black } = await matchPlayers({ target, user: alice }, { target, user: bob });
    const w = await joinGame(target, gameId, white.user);
    const b = await joinGame(target, gameId, black.user);

    const ended = [w.socket, b.socket].map((s) => waitFor(s, 'game:ended'));
    b.socket.emit('game:resign', { gameId, color: 'white' }); // couleur ignorée en ligne
    for (const payload of await Promise.all(ended)) {
      expect(payload).toEqual({ result: 'WHITE_WIN', reason: 'RESIGNATION' });
    }
  });

  describe('file d\'attente', () => {
    it('anonyme : matchmaking refusé', async () => {
      const anon = await connectSocket(target, '/lobby');
      const error = waitFor(anon, 'lobby:error');
      anon.emit('lobby:joinQueue', { timeControl: 'BLITZ' });
      expect((await error).message).toContain('Authentification requise');
    });

    it('fermer l\'application retire le joueur de la file (sprint 20)', async () => {
      const ivan = await registerUser(target, 'rt-ivan');
      const lobby = await connectSocket(target, '/lobby', ivan);
      const queued = waitFor(lobby, 'lobby:queued');
      lobby.emit('lobby:joinQueue', { timeControl: 'CLASSICAL' });
      await queued;

      const status = () => target.api().get('/api/v1/matchmaking/status').set(bearer(ivan)).expect(200);
      expect((await status()).body.status).toBe('waiting');

      lobby.disconnect();
      await eventually(async () => expect((await status()).body.status).toBe('not_in_queue'));
    });

    it('lobby:leaveQueue : sortie volontaire confirmée', async () => {
      const jo = await registerUser(target, 'rt-jo');
      const lobby = await connectSocket(target, '/lobby', jo);
      const queued = waitFor(lobby, 'lobby:queued');
      lobby.emit('lobby:joinQueue', { timeControl: 'CLASSICAL' });
      await queued;

      const left = waitFor(lobby, 'lobby:leftQueue');
      lobby.emit('lobby:leaveQueue', {});
      await left;
      const res = await target.api().get('/api/v1/matchmaking/status').set(bearer(jo)).expect(200);
      expect(res.body.status).toBe('not_in_queue');
    });
  });

  describe('salle privée en direct', () => {
    it('l\'hôte attend dans la salle et est prévenu quand l\'invité arrive', async () => {
      const [host, guest] = await Promise.all([registerUser(target, 'rt-host'), registerUser(target, 'rt-guest')]);
      const hostLobby = await connectSocket(target, '/lobby', host);
      const guestLobby = await connectSocket(target, '/lobby', guest);

      const created = waitFor(hostLobby, 'lobby:roomCreated');
      hostLobby.emit('lobby:createRoom', { timeControl: 'RAPID' });
      const { roomCode, gameId } = await created;

      const waiting = waitFor(hostLobby, 'lobby:waiting');
      hostLobby.emit('lobby:waitRoom', { roomCode });
      await waiting;

      const opponentJoined = waitFor(hostLobby, 'lobby:opponentJoined');
      const joined = waitFor(guestLobby, 'lobby:roomJoined');
      guestLobby.emit('lobby:joinRoom', { roomCode });
      expect(await joined).toEqual({ gameId, roomCode });
      expect(await opponentJoined).toEqual({ gameId });

      // Notification « adversaire arrivé » enregistrée pour l'hôte
      const notifs = await eventually(async () => {
        const res = await target.api().get('/api/v1/notifications').set(bearer(host)).expect(200);
        const items = res.body.items ?? res.body;
        expect(items.length).toBeGreaterThan(0);
        return items;
      });
      expect(JSON.stringify(notifs)).toContain(gameId);
    });
  });
});
