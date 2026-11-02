// ─────────────────────────────────────────────────────────────────────────────
// E2E — Plusieurs réplicas de l'API (sprint 19, vérifié au sprint 20)
//
// Deux instances (« pod A » et « pod B ») partagent la même base et le même
// Redis, comme deux pods Kubernetes derrière l'ingress. Les joueurs sont
// volontairement servis par des pods DIFFÉRENTS.
// ─────────────────────────────────────────────────────────────────────────────
import {
  closeSockets, expectNoEvent, joinGame, matchPlayers, playMove, registerUser,
  RunningApp, startApp, waitFor,
} from './e2e-utils';

describe('Plusieurs réplicas (e2e)', () => {
  let podA: RunningApp;
  let podB: RunningApp;

  beforeAll(async () => {
    [podA, podB] = await Promise.all([startApp(), startApp()]);
  });

  afterEach(() => closeSockets());
  afterAll(async () => {
    await podA?.close();
    await podB?.close();
  });

  it('appariement entre pods, coups et nulle relayés d\'un pod à l\'autre', async () => {
    const [alice, bob] = await Promise.all([registerUser(podA, 'pod-alice'), registerUser(podB, 'pod-bob')]);

    // alice attend sur le pod A, bob arrive sur le pod B : chacun est prévenu
    // sur son propre pod (émission par identifiant de socket via Redis)
    const { gameId, white, black } = await matchPlayers({ target: podA, user: alice }, { target: podB, user: bob });
    const podOf = (userId: string) => (userId === alice.id ? podA : podB);

    const w = await joinGame(podOf(white.user.id), gameId, white.user);
    const b = await joinGame(podOf(black.user.id), gameId, black.user);
    const both = [w.socket, b.socket];

    // Les coups traversent l'adaptateur Socket.IO Redis
    await playMove(w.socket, gameId, 'e2e4', both);
    await playMove(b.socket, gameId, 'e7e5', both);

    // Proposition faite sur un pod, acceptée sur l'autre (stockage Redis)
    const offered = waitFor(b.socket, 'game:drawOffered');
    w.socket.emit('game:drawOffer', { gameId });
    expect(await offered).toEqual({ by: 'white' });

    const ended = both.map((s) => waitFor(s, 'game:ended'));
    b.socket.emit('game:drawResponse', { gameId, accept: true });
    for (const payload of await Promise.all(ended)) {
      expect(payload).toEqual({ result: 'DRAW', reason: 'DRAW_AGREEMENT' });
    }
  });

  it('présence à l\'échelle du cluster : un joueur encore connecté sur l\'autre pod n\'est pas « parti »', async () => {
    const [alice, bob] = await Promise.all([registerUser(podA, 'pod-carl'), registerUser(podB, 'pod-dina')]);
    const { gameId, white, black } = await matchPlayers({ target: podA, user: alice }, { target: podB, user: bob });

    const w = await joinGame(podA, gameId, white.user);
    // Les noirs ont deux appareils : un sur chaque pod
    const bOnB = await joinGame(podB, gameId, black.user);
    await joinGame(podA, gameId, black.user);

    // Fermer l'appareil du pod B : les noirs restent présents via le pod A
    const silence = expectNoEvent(w.socket, 'game:opponentDisconnected', 1000);
    bOnB.socket.disconnect();
    await silence;

    // Sans aucun appareil restant, l'adversaire est bien prévenu
    closeSockets(); // ferme aussi le socket des blancs : on en rouvre un
    const w2 = await joinGame(podA, gameId, white.user);
    const black2 = await joinGame(podB, gameId, black.user);
    const away = waitFor(w2.socket, 'game:opponentDisconnected');
    black2.socket.disconnect();
    expect(await away).toEqual({ graceMs: 30_000 });
  });
});
