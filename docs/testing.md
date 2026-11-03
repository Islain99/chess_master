# Tests de Chess Platform

> Sprints 20-21 — tests unitaires, tests end-to-end sur Postgres et Redis réels, tests de widgets Flutter.

| Suite | Où | Ce qu'elle couvre | Prérequis |
|---|---|---|---|
| Unitaires API (292) | `apps/api/src/**/*.spec.ts` | services, gateways Socket.IO, gardes, filtres, métriques, règles de jeu | aucun |
| End-to-end API (49) | `apps/api/test/*.e2e-spec.ts` | l'application complète par HTTP et Socket.IO | PostgreSQL + Redis |
| Client Flutter (105) | `apps/client/test/*_test.dart` | modèles, services, widgets, écrans d'authentification | Flutter SDK |
| Chart Helm | `infra/helm/chess-platform` | `helm lint --strict`, rendu complet | Helm 3+ |

Tout est exécuté par la CI à chaque push et à chaque pull request.

---

## 1. API — tests unitaires

```bash
cd apps/api
npm ci && npx prisma generate
npm test                    # 27 suites, 292 tests, ~25 s
npm test -- --coverage      # avec couverture
npm test -- matchmaking     # filtrer par nom de fichier
```

Aucune base ni aucun Redis : Prisma et Redis sont simulés. Pour Redis, `src/testing/fake-redis.mock-spec.ts` fournit un Redis en mémoire dont chaque commande cède la main : deux services qui partagent la même instance s'entrelacent comme deux pods réels (voir `matchmaking.concurrency.spec.ts`).

> Les fichiers `*.mock-spec.ts` sont des outils de test : exclus du build de production (`tsconfig.build.json`), ils ne sont pas pris pour des suites par Jest.

## 2. API — tests end-to-end

L'application est démarrée **exactement comme en production** (`configureApp` de `src/app.setup.ts` : préfixe `/api/v1`, validation, filtre d'erreurs, Helmet, CORS, adaptateur Socket.IO Redis) et écoute sur un vrai port. Les tests passent par HTTP (supertest) et par de vrais clients Socket.IO, comme l'application Flutter.

```bash
# 1. Services (depuis la racine du dépôt)
docker compose -f infra/docker-compose.yml up -d postgres redis

# 2. Schéma, puis tests
cd apps/api
npx prisma db push --skip-generate
npm run test:e2e            # 5 suites, 49 tests, ~15 s
```

Variables lues (valeurs par défaut dans `test/setup-env.ts`) :

| Variable | Défaut |
|---|---|
| `DATABASE_URL` | `postgresql://chess:chess@localhost:5432/chess` |
| `REDIS_URL` | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | secret de test |
| `THROTTLE_SHORT_LIMIT` / `THROTTLE_LONG_LIMIT` | relevées (1 000 / 100 000) : les tests enchaînent des centaines de requêtes depuis 127.0.0.1 |

Les tests **ne vident aucune table** : chaque exécution crée ses propres comptes (`<nom>-<identifiant d'exécution>-<n>@e2e.test`). On peut donc les lancer sur une base de développement ; ils y laissent quelques comptes de test.

| Suite | Scénarios |
|---|---|
| `app.e2e-spec.ts` | santé, disponibilité (base joignable), `/metrics` hors préfixe, format d'erreur commun, en-têtes Helmet, CORS |
| `auth.e2e-spec.ts` | inscription (adresse normalisée, doublon insensible à la casse, messages de validation), connexion, profil, **rotation des refresh tokens, détection de réutilisation (vol), échanges simultanés**, déconnexion |
| `games.e2e-spec.ts` | partie contre l'IA, partie locale jusqu'au mat, annulation, import FEN / PGN, analyse (file d'attente, tâche unique), classement paginé, salle privée, autorisations en ligne (anonyme, intrus, mauvais tour, abandon, nulle), historique « Mes parties » |
| `realtime.e2e-spec.ts` | matchmaking → partie classée jouée jusqu'au mat → Elo et statistiques ; coups refusés en direct, spectateur ; nulle (refus puis acceptation) ; abandon ; sortie de file (volontaire et à la fermeture de l'appli) ; salle privée en direct et notification |
| `multi-replica.e2e-spec.ts` | **deux instances** de l'API sur la même base et le même Redis : appariement, coups et nulle relayés d'un pod à l'autre, présence calculée sur tout le cluster |

Le dernier fichier échoue si l'adaptateur Socket.IO Redis est désactivé : il protège l'exploitation à plusieurs réplicas du chart Helm.

Les fichiers utilitaires :

- `test/e2e-utils.ts` : `startApp()` (une instance = un « pod »), `registerUser()`, `connectSocket()`, `waitFor()` / `expectNoEvent()` (événements Socket.IO), `eventually()` (tâches asynchrones comme l'Elo), `matchPlayers()`, `joinGame()`, `playMove()` ;
- `test/setup-env.ts` : variables par défaut ;
- `test/jest-e2e.json` : configuration (exécution en série, délai de 30 s par test).

## 3. Client Flutter

```bash
cd apps/client
flutter pub get
flutter analyze             # 0 problème attendu
flutter test                # 105 tests
flutter test test/sprint20_widgets_test.dart   # un fichier
```

| Fichier | Contenu |
|---|---|
| `board_position_test.dart`, `chess_move_test.dart`, `game_state_test.dart` | modèles (FEN, coups, état de partie) |
| `oauth_service_test.dart`, `push_service_test.dart` | connexion Google / Apple / Facebook, notifications push, client HTTP |
| `sprint18_test.dart` | évaluation, lecteur, historique, avatars, styles de pièces |
| `widget_test.dart` | pendule |
| `sprint20_widgets_test.dart` | plateau (cases, orientation, coordonnées, couleurs, sélection, glisser-déposer, **réglages appliqués**), promotion, liste des coups, écrans de connexion et d'inscription sur un faux serveur HTTP |

Les écrans ne sont jamais montés avec `AppTheme.theme` : `google_fonts` téléchargerait des polices pendant les tests. Les appels réseau passent par `ApiClient(client: MockClient(...))` ; `SharedPreferences.setMockInitialValues` simule le stockage local.

## 4. Chart Helm

```bash
helm lint --strict infra/helm/chess-platform
helm lint --strict infra/helm/chess-platform -f infra/helm/chess-platform/values-production.example.yaml
helm template chess infra/helm/chess-platform --set monitoring.enabled=true \
  --api-versions monitoring.coreos.com/v1/ServiceMonitor \
  --api-versions monitoring.coreos.com/v1/PrometheusRule
```

## 5. Écrire un nouveau test end-to-end

```ts
import { bearer, closeSockets, joinGame, matchPlayers, playMove, registerUser, startApp } from './e2e-utils';

describe('Ma fonctionnalité (e2e)', () => {
  let target;
  beforeAll(async () => { target = await startApp(); });
  afterEach(() => closeSockets());
  afterAll(() => target?.close());

  it('…', async () => {
    const [alice, bob] = await Promise.all([registerUser(target, 'alice'), registerUser(target, 'bob')]);
    const { gameId, white, black } = await matchPlayers({ target, user: alice }, { target, user: bob });
    const w = await joinGame(target, gameId, white.user);
    const b = await joinGame(target, gameId, black.user);
    await playMove(w.socket, gameId, 'e2e4', [w.socket, b.socket]);
  });
});
```

Règle d'or : appeler `waitFor(socket, 'événement')` **avant** de déclencher l'action, sinon l'événement peut arriver avant l'écoute.
