// ─────────────────────────────────────────────────────────────────────────────
// E2E — Authentification : inscription, connexion, profil, rotation des
// jetons de rafraîchissement et détection de réutilisation (sprint 20)
// ─────────────────────────────────────────────────────────────────────────────
import { bearer, registerUser, RUN_ID, RunningApp, startApp } from './e2e-utils';

describe('Authentification (e2e)', () => {
  let target: RunningApp;

  beforeAll(async () => {
    target = await startApp();
  });

  afterAll(() => target?.close());

  describe('inscription', () => {
    it('crée un compte et renvoie access + refresh tokens et le profil public', async () => {
      const email = `alice-${RUN_ID}@e2e.test`;
      const res = await target
        .api()
        .post('/api/v1/auth/register')
        .send({ email, password: 'motdepasse-e2e', displayName: '  Alice  ' })
        .expect(201);

      expect(res.body).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresIn: 900,
        user: { email, displayName: 'Alice', role: 'PLAYER', authProvider: 'LOCAL' },
      });
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('adresse normalisée : la même adresse en majuscules est refusée (409)', async () => {
      const email = `bob-${RUN_ID}@e2e.test`;
      await target.api().post('/api/v1/auth/register')
        .send({ email, password: 'motdepasse-e2e', displayName: 'Bob' }).expect(201);

      const res = await target.api().post('/api/v1/auth/register')
        .send({ email: `  ${email.toUpperCase()} `, password: 'motdepasse-e2e', displayName: 'Bob2' })
        .expect(409);
      expect(res.body.message).toContain('déjà utilisée');
    });

    it('données invalides → 400 avec les messages de validation', async () => {
      const res = await target.api().post('/api/v1/auth/register')
        .send({ email: 'pas-une-adresse', password: 'court', displayName: 'x' })
        .expect(400);
      const text = JSON.stringify(res.body);
      expect(text).toContain('Adresse e-mail invalide.');
      expect(text).toContain('au moins 8 caractères');
      expect(text).toContain('entre 2 et 32 caractères');
    });

    it('mot de passe démesuré (> 128) refusé', async () => {
      await target.api().post('/api/v1/auth/register')
        .send({ email: `long-${RUN_ID}@e2e.test`, password: 'x'.repeat(200), displayName: 'Long' })
        .expect(400);
    });
  });

  describe('connexion', () => {
    it('identifiants valides (casse de l\'adresse indifférente) → jetons', async () => {
      const user = await registerUser(target, 'carol');
      const res = await target.api().post('/api/v1/auth/login')
        .send({ email: user.email.toUpperCase(), password: user.password })
        .expect(200);
      expect(res.body.user.id).toBe(user.id);
    });

    it('mauvais mot de passe et compte inconnu : même réponse 401', async () => {
      const user = await registerUser(target, 'dave');
      const wrong = await target.api().post('/api/v1/auth/login')
        .send({ email: user.email, password: 'mauvais-mdp' }).expect(401);
      const unknown = await target.api().post('/api/v1/auth/login')
        .send({ email: `inconnu-${RUN_ID}@e2e.test`, password: 'mauvais-mdp' }).expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });
  });

  describe('profil', () => {
    it('GET /auth/me : 401 sans jeton, profil avec jeton', async () => {
      const user = await registerUser(target, 'erin');
      await target.api().get('/api/v1/auth/me').expect(401);
      await target.api().get('/api/v1/auth/me').set('Authorization', 'Bearer pas-un-jwt').expect(401);

      const res = await target.api().get('/api/v1/auth/me').set(bearer(user)).expect(200);
      expect(res.body).toMatchObject({ id: user.id, displayName: user.displayName });
    });

    it('PATCH /auth/me : met à jour le nom et le pays', async () => {
      const user = await registerUser(target, 'frank');
      const res = await target.api().patch('/api/v1/auth/me').set(bearer(user))
        .send({ displayName: 'Frank le Fou', country: 'CA' })
        .expect(200);
      expect(res.body).toMatchObject({ displayName: 'Frank le Fou', country: 'CA' });
    });

    it('profil public : pas d\'adresse e-mail exposée', async () => {
      const user = await registerUser(target, 'gina');
      const res = await target.api().get(`/api/v1/users/${user.id}`).expect(200);
      expect(res.body.displayName).toBe(user.displayName);
      expect(res.body.email).toBeUndefined();
    });
  });

  describe('jetons de rafraîchissement', () => {
    const refresh = (token: string) =>
      target.api().post('/api/v1/auth/refresh').send({ refreshToken: token });

    it('rotation : nouveau couple de jetons, l\'ancien refresh token n\'est plus accepté', async () => {
      const user = await registerUser(target, 'hugo');

      const first = await refresh(user.refreshToken).expect(200);
      expect(first.body.refreshToken).not.toBe(user.refreshToken);
      await target.api().get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${first.body.accessToken}`).expect(200);

      await refresh(user.refreshToken).expect(401);
    });

    it('réutilisation d\'un jeton déjà échangé (vol) : TOUTES les sessions sont fermées', async () => {
      const victim = await registerUser(target, 'ines');

      // L'attaquant a copié le refresh token et l'échange le premier…
      const attacker = await refresh(victim.refreshToken).expect(200);

      // …la victime présente ensuite le même jeton : réutilisation détectée
      const reuse = await refresh(victim.refreshToken).expect(401);
      expect(reuse.body.message).toContain('déjà utilisé');

      // La session de l'attaquant est fermée elle aussi
      await refresh(attacker.body.refreshToken).expect(401);
    });

    it('deux échanges simultanés du même jeton : un seul réussit', async () => {
      const user = await registerUser(target, 'jade');
      const results = await Promise.all([refresh(user.refreshToken), refresh(user.refreshToken)]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('déconnexion : le refresh token est révoqué', async () => {
      const user = await registerUser(target, 'karl');
      await target.api().post('/api/v1/auth/logout').set(bearer(user))
        .send({ refreshToken: user.refreshToken }).expect(204);
      await refresh(user.refreshToken).expect(401);
    });

    it('jeton inconnu → 401', async () => {
      await refresh('00000000-0000-4000-8000-000000000000').expect(401);
    });
  });
});
