// ─────────────────────────────────────────────────────────────────────────────
// E2E — Parties par l'API REST : partie contre l'IA, partie locale, salle
// privée et règles d'autorisation des parties en ligne (sprint 17)
// ─────────────────────────────────────────────────────────────────────────────
import { bearer, registerUser, RunningApp, startApp, TestUser } from './e2e-utils';

describe('Parties REST (e2e)', () => {
  let target: RunningApp;

  beforeAll(async () => {
    target = await startApp();
  });

  afterAll(() => target?.close());

  const move = (gameId: string, uci: string, user?: TestUser) => {
    const req = target.api().post(`/api/v1/games/${gameId}/moves`);
    return (user ? req.set(bearer(user)) : req).send({ uci });
  };

  describe('contre l\'IA', () => {
    let alice: TestUser;
    let gameId: string;

    beforeAll(async () => {
      alice = await registerUser(target, 'ia-alice');
      const res = await target.api().post('/api/v1/games').set(bearer(alice))
        .send({ mode: 'AI', timeControl: 'RAPID', aiLevel: 1 })
        .expect(201);
      gameId = res.body.id;
      expect(res.body).toMatchObject({
        mode: 'AI', status: 'ONGOING', whitePlayerId: alice.id,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      });
      expect(res.body.legalMoves).toHaveLength(20);
    });

    it('un coup du joueur reçoit immédiatement la réponse de l\'IA', async () => {
      const res = await move(gameId, 'e2e4', alice).expect(201);
      expect(res.body.move).toMatchObject({ san: 'e4', uci: 'e2e4' });
      expect(res.body.aiMove).toMatchObject({ uci: expect.stringMatching(/^[a-h][1-8][a-h][1-8]/) });
      expect(res.body.game.fen.split(' ')[1]).toBe('w'); // de nouveau aux blancs
    });

    it('coup illégal → 422 ILLEGAL_MOVE ; format invalide → 400', async () => {
      const illegal = await move(gameId, 'e1e5', alice).expect(422);
      expect(illegal.body.message).toContain('illégal');
      await move(gameId, 'pas-uci', alice).expect(400);
    });

    it('GET /games/:id : historique des coups et PGN', async () => {
      const res = await target.api().get(`/api/v1/games/${gameId}`).expect(200);
      expect(res.body.moves.map((m: any) => m.ply)).toEqual([1, 2]);

      const pgn = await target.api().get(`/api/v1/games/${gameId}/pgn`).expect(200);
      expect(pgn.text).toContain('1. e4');
    });

    it('analyse refusée tant que la partie est en cours (400)', async () => {
      const res = await target.api().post(`/api/v1/games/${gameId}/analysis`).set(bearer(alice)).expect(400);
      expect(res.body.message).toContain('terminée');
    });

    it('abandon → partie terminée, plus aucun coup accepté', async () => {
      const res = await target.api().post(`/api/v1/games/${gameId}/resign`).set(bearer(alice))
        .send({ color: 'white' }).expect(200);
      expect(res.body).toMatchObject({ status: 'FINISHED', result: 'BLACK_WIN', resultReason: 'RESIGNATION' });
      await move(gameId, 'd2d4', alice).expect(400);
    });
  });

  describe('import FEN / PGN', () => {
    it('FEN : partie locale depuis la position donnée', async () => {
      const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2';
      const res = await target.api().post('/api/v1/games/import').send({ fen }).expect(201);
      expect(res.body).toMatchObject({ mode: 'LOCAL', status: 'ONGOING', fen, initialFen: fen });
    });

    it('PGN terminé par un mat : coups rejoués, partie close', async () => {
      const res = await target.api().post('/api/v1/games/import')
        .send({ pgn: '1. f3 e5 2. g4 Qh4# 0-1' }).expect(201);
      expect(res.body).toMatchObject({ status: 'FINISHED', result: 'BLACK_WIN' });
      expect(res.body.moves.map((m: any) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    });

    it('ni PGN ni FEN → 400 (sprint 21)', async () => {
      await target.api().post('/api/v1/games/import').send({}).expect(400);
    });
  });

  describe('analyse et classement', () => {
    it('analyse d\'une partie terminée : file d\'attente, une seule tâche par partie', async () => {
      const user = await registerUser(target, 'analyse');
      const created = await target.api().post('/api/v1/games').set(bearer(user))
        .send({ mode: 'LOCAL', timeControl: 'RAPID' }).expect(201);
      const id = created.body.id;
      for (const uci of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) await move(id, uci).expect(201);

      const first = await target.api().post(`/api/v1/games/${id}/analysis`).set(bearer(user)).expect(202);
      const second = await target.api().post(`/api/v1/games/${id}/analysis`).set(bearer(user)).expect(202);
      expect(second.body.jobId).toBe(first.body.jobId);

      // Aucun moteur IA dans les tests : la tâche reste en attente
      const status = await target.api().get(`/api/v1/games/${id}/analysis`).set(bearer(user)).expect(200);
      expect(status.body.status).toBe('processing');
    });

    it('classement public : pagination bornée, cadence inconnue refusée', async () => {
      const res = await target.api().get('/api/v1/leaderboard?timeControl=BLITZ&page=0&pageSize=100000').expect(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 50, timeControl: 'BLITZ' });
      await target.api().get('/api/v1/leaderboard?timeControl=ULTRA').expect(400);
    });
  });

  describe('partie locale (deux joueurs sur le même appareil)', () => {
    it('mat de l\'idiot : mat détecté par le serveur, partie close', async () => {
      const created = await target.api().post('/api/v1/games')
        .send({ mode: 'LOCAL', timeControl: 'RAPID' }).expect(201);
      const id = created.body.id;

      for (const uci of ['f2f3', 'e7e5', 'g2g4']) await move(id, uci).expect(201);
      const mate = await move(id, 'd8h4').expect(201);

      expect(mate.body.move.isCheckmate).toBe(true);
      expect(mate.body.game).toMatchObject({ status: 'FINISHED', result: 'BLACK_WIN', resultReason: 'CHECKMATE' });
      expect(mate.body.game.legalMoves).toEqual([]);
    });

    it('annulation du dernier coup (undo)', async () => {
      const created = await target.api().post('/api/v1/games')
        .send({ mode: 'LOCAL', timeControl: 'RAPID' }).expect(201);
      await move(created.body.id, 'e2e4').expect(201);
      const undo = await target.api().post(`/api/v1/games/${created.body.id}/undo`).expect(200);
      expect(undo.body.fen).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    });
  });

  describe('salle privée et autorisations en ligne', () => {
    let alice: TestUser;
    let bob: TestUser;
    let eve: TestUser;
    let gameId: string;
    let roomCode: string;

    beforeAll(async () => {
      [alice, bob, eve] = await Promise.all([
        registerUser(target, 'salle-alice'),
        registerUser(target, 'salle-bob'),
        registerUser(target, 'salle-eve'),
      ]);
      const room = await target.api().post('/api/v1/rooms').set(bearer(alice))
        .send({ timeControl: 'BLITZ' }).expect(201);
      ({ roomCode, gameId } = room.body);
      expect(roomCode).toMatch(/^[A-Z2-9]{6}$/);
    });

    it('l\'hôte ne peut pas rejoindre sa propre salle ; code inconnu → 404', async () => {
      await target.api().post(`/api/v1/rooms/${roomCode}/join`).set(bearer(alice)).expect(409);
      await target.api().post('/api/v1/rooms/ZZZZZZ/join').set(bearer(bob)).expect(404);
    });

    it('rejoindre (code insensible à la casse) → partie lancée, salle ensuite complète', async () => {
      const res = await target.api().post(`/api/v1/rooms/${roomCode.toLowerCase()}/join`)
        .set(bearer(bob)).expect(200);
      expect(res.body).toMatchObject({ id: gameId, status: 'ONGOING', whitePlayerId: alice.id, blackPlayerId: bob.id });

      await target.api().post(`/api/v1/rooms/${roomCode}/join`).set(bearer(eve)).expect(409);
    });

    it('anonyme, intrus, mauvais tour : refusés ; le bon joueur peut jouer', async () => {
      const anon = await move(gameId, 'e2e4').expect(401);
      expect(anon.body.error).toBe('AUTH_REQUIRED');

      const intruder = await move(gameId, 'e2e4', eve).expect(403);
      expect(intruder.body.error).toBe('NOT_A_PLAYER');

      const early = await move(gameId, 'e7e5', bob).expect(403);
      expect(early.body.error).toBe('NOT_YOUR_TURN');

      await move(gameId, 'e2e4', alice).expect(201);
      await move(gameId, 'e7e5', bob).expect(201);
    });

    it('nulle REST sans proposition de l\'adversaire → 409 NO_DRAW_OFFER', async () => {
      const res = await target.api().post(`/api/v1/games/${gameId}/draw`).set(bearer(bob)).expect(409);
      expect(res.body.error).toBe('NO_DRAW_OFFER');
    });

    it('un intrus ne peut pas abandonner à la place d\'un joueur', async () => {
      await target.api().post(`/api/v1/games/${gameId}/resign`).set(bearer(eve))
        .send({ color: 'white' }).expect(403);
    });

    it('abandon : la couleur envoyée est ignorée, c\'est celle du joueur qui compte', async () => {
      const res = await target.api().post(`/api/v1/games/${gameId}/resign`).set(bearer(bob))
        .send({ color: 'white' }) // bob est noir : c'est bien LUI qui abandonne
        .expect(200);
      expect(res.body).toMatchObject({ result: 'WHITE_WIN', resultReason: 'RESIGNATION' });
    });

    it('historique « Mes parties » : résumé du point de vue de chaque joueur', async () => {
      const res = await target.api().get(`/api/v1/users/${bob.id}/games`).set(bearer(bob)).expect(200);
      const summary = res.body.items.find((g: any) => g.id === gameId);
      expect(summary).toMatchObject({ color: 'black', outcome: 'loss' });
      expect(summary.opponent).toMatchObject({ type: 'user', displayName: alice.displayName });
    });
  });
});
