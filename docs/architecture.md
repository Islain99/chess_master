# Architecture de Chess Platform

> Sprint 21 — diagrammes UML (composants, modules, classes, séquences, états, déploiement).
> Les diagrammes sont écrits en [Mermaid](https://mermaid.js.org) : GitHub, GitLab et la plupart des éditeurs Markdown les affichent directement.

Documents liés : [base de données](database.md) · [API REST](api-rest-spec.md) · [événements WebSocket](websocket-events.md) · [déploiement](deployment.md) · [tests](testing.md) · [guide utilisateur](user-guide.md).

---

## 1. Vue d'ensemble

Chess Platform est un **monorepo** de trois applications :

| Application | Technologie | Rôle |
|---|---|---|
| `apps/client` | Flutter 3 (Riverpod) | Interface : Web, Android, iOS, Windows, macOS, Linux |
| `apps/api` | NestJS 10, Prisma, Socket.IO | Autorité de jeu : comptes, règles, pendule, parties en ligne, Elo, notifications |
| `apps/ai-engine` | NestJS 10, Stockfish (UCI) | Coups de l'IA niveau 5 et analyse des parties terminées |

Principe directeur : **le serveur est l'unique autorité**. Chaque coup est revalidé par `chess.js` côté API, la pendule des parties en ligne est mesurée par le serveur, et seul le joueur concerné peut jouer, abandonner ou accepter une nulle.

### 1.1 Diagramme de composants

```mermaid
flowchart LR
  subgraph Clients["Clients Flutter"]
    W[Web]
    M[Android / iOS]
    D[Windows / macOS / Linux]
  end

  subgraph API["apps/api — NestJS"]
    REST[API REST<br/>/api/v1/*]
    WS[Socket.IO<br/>/game · /lobby]
    MET[/metrics/]
  end

  subgraph IA["apps/ai-engine — NestJS"]
    MOVE[POST /move]
    WORKER[Worker d'analyse<br/>BullMQ]
    SF[(Stockfish<br/>processus UCI)]
  end

  PG[(PostgreSQL 16)]
  RD[(Redis 7)]
  FCM[Firebase Cloud<br/>Messaging]
  OAUTH[Google · Apple ·<br/>Facebook]
  PROM[Prometheus /<br/>Grafana]

  W & M & D -- HTTPS JSON --> REST
  W & M & D -- WebSocket --> WS
  REST & WS --> PG
  REST & WS -- files, verrous,<br/>adaptateur Socket.IO --> RD
  REST -- HTTP --> MOVE
  REST -- tâche « analyze » --> RD
  RD -- BullMQ --> WORKER
  MOVE & WORKER --> SF
  WORKER --> PG
  REST -- vérification des jetons --> OAUTH
  REST -- push --> FCM
  FCM -. notification .-> M & W
  PROM -. collecte .-> MET
```

### 1.2 Rôle de Redis

| Usage | Clés / canaux | Module |
|---|---|---|
| File de matchmaking | `mm:queue:<cadence>` (ensemble trié par Elo), `mm:data:<userId>` (hachage, 5 min) | `MatchmakingService` |
| Verrous d'appariement | `mm:lock:player:<userId>` (10 s, jeton) | `MatchmakingService` |
| Propositions de nulle | `chess:draw-offer:<gameId>` (2 h) | `RedisDrawOfferStore` |
| Diffusion Socket.IO entre pods | canaux `chess-socket.io#…` | `RedisIoAdapter` |
| Tâches d'analyse | `bull:analysis:*` | BullMQ (`AnalysisService` → worker de l'IA) |

Aucune donnée durable n'est dans Redis : sa perte vide la file d'attente et les propositions de nulle en cours, rien d'autre.

---

## 2. API NestJS

### 2.1 Modules

```mermaid
flowchart TB
  App[AppModule]
  App --> Config[ConfigModule]
  App --> Throttler[ThrottlerModule<br/>garde globale]
  App --> Bull[BullModule<br/>Redis]
  App --> Metrics[MetricsModule<br/>global]
  App --> Prisma[PrismaModule<br/>global]
  App --> Health[HealthModule]
  App --> Auth[AuthModule]
  App --> Users[UsersModule]
  App --> Games[GamesModule]
  App --> MM[MatchmakingModule]
  App --> Rooms[RoomsModule]
  App --> Ratings[RatingsModule]
  App --> Analysis[AnalysisModule]
  App --> Leaderboard[LeaderboardModule]
  App --> Realtime[RealtimeModule]
  App --> Notif[NotificationsModule]
  App --> AC[AntiCheatModule<br/>non branché]
  App --> Stats[StatisticsModule<br/>squelette]

  Games --> Ratings
  MM --> Ratings
  MM --> Auth
  Rooms --> Auth
  Users --> Auth
  Notif --> Auth
  Realtime --> Games
  Realtime --> Rooms
  Realtime --> MM
  Realtime --> Ratings
  Realtime --> Auth
  Realtime --> Notif
```

| Module | Contenu principal |
|---|---|
| `AuthModule` | inscription, connexion, rotation des refresh tokens, OAuth (Google, Apple, Facebook), stratégie JWT |
| `GamesModule` | `GamesService` (création, coups, pendule, fin de partie), `ChessEngineService` (chess.js), `AiEngineService` (IA niveaux 1-4), `StockfishClientService` (niveau 5), stockage des propositions de nulle |
| `RealtimeModule` | `GameGateway` (`/game`) et `LobbyGateway` (`/lobby`), limitation de débit des coups |
| `MatchmakingModule` | file Redis, appariement par Elo, verrous par joueur |
| `RoomsModule` | salles privées à code de 6 caractères |
| `RatingsModule` | Elo par cadence (K = 40 / 20 / 10), statistiques de fin de partie |
| `AnalysisModule` | envoi des tâches d'analyse, lecture des résultats |
| `NotificationsModule` | notifications en base, appareils push, envoi FCM |
| `MetricsModule` | registre Prometheus, mesure HTTP, `GET /metrics` |
| `AntiCheatModule` | heuristiques de temps de réflexion — **écrites mais appelées nulle part** |
| `StatisticsModule` | squelette vide (les statistiques sont calculées par `RatingsService`) |

### 2.2 Chaîne de traitement d'une requête HTTP

```mermaid
flowchart LR
  R[Requête] --> H[Helmet + CORS]
  H --> MW[HttpMetricsMiddleware]
  MW --> TG[ThrottlerGuard<br/>10 req/s · 300 req/min par IP]
  TG --> JG[JwtAuthGuard /<br/>OptionalJwtAuthGuard]
  JG --> VP[ValidationPipe<br/>whitelist + transform]
  VP --> C[Contrôleur]
  C --> S[Service]
  S --> P[(Prisma)]
  C -. exception .-> F[GlobalExceptionFilter<br/>statusCode · error · message · path]
```

La configuration (préfixe `/api/v1`, Helmet, CORS, validation, filtre, adaptateur Redis) est centralisée dans `src/app.setup.ts` et partagée par `main.ts` et les tests end-to-end.

### 2.3 Diagramme de classes — domaine de jeu

```mermaid
classDiagram
  direction LR

  class GamesController {
    +create(dto, req)
    +findOne(id)
    +makeMove(id, dto, req)
    +undoMove(id)
    +resign(id, body, req)
    +acceptDraw(id, req)
    +getPgn(id)
    +importGame(dto)
  }

  class GameGateway {
    -connections: Map~socketId, ConnInfo~
    -disconnectTimers: Map~gameColor, Timeout~
    +handleConnection(socket)
    +handleDisconnect(socket)
    +handleJoin(data, socket)
    +handleMove(data, socket)
    +handleResign(data, socket)
    +handleDrawOffer(data, socket)
    +handleDrawResponse(data, socket)
    -presentUsers(gameId) Set~userId~
  }

  class GamesService {
    +create(dto, actor) GameResponse
    +findById(id) GameResponse
    +makeMove(id, dto, actor) MoveResult
    +resign(id, color, actor, reason)
    +offerDraw(id, actor) Seat
    +declineDraw(id, actor)
    +acceptDraw(id, actor)
    +undoMove(id)
    -applyAiMove(...)
    -afterGameEnded(game)
  }

  class GameAccess {
    <<module>>
    +requirePlayer(game, actor) Seat
    +assertCanMove(game, actor)
    +isOnlineGame(mode) bool
    +SYSTEM_ACTOR
  }

  class ChessEngineService {
    +applyMove(fen, uci) MoveOutcome
    +getStatus(fen) Status
    +activeColor(fen) w|b
  }

  class AiEngineService {
    +getBestMove(fen, level) uci
  }

  class StockfishClientService {
    +getBestMove(fen, targetElo) uci
    +isAvailable() bool
  }

  class DrawOfferStore {
    <<interface>>
    +get(gameId) Seat?
    +set(gameId, seat)
    +delete(gameId)
  }
  class RedisDrawOfferStore
  class MemoryDrawOfferStore

  class RatingsService {
    +getElo(userId, tc) int
    +updateAfterGame(gameId)
  }

  class NotificationsService {
    +notifyTurn(game, san, isPresent)
    +notifyGameEnded(game, isPresent)
    +notifyRoomJoined(game)
  }

  class PushService {
    +registerDevice(userId, token, platform)
    +sendToUser(userId, type, payload)
  }

  class MetricsService {
    +wsConnected(ns)
    +gameFinished(game)
    +pushResult(result)
  }

  GamesController --> GamesService
  GameGateway --> GamesService
  GameGateway --> NotificationsService
  GameGateway ..> MetricsService
  GamesService --> ChessEngineService
  GamesService --> AiEngineService
  GamesService --> StockfishClientService
  GamesService --> RatingsService
  GamesService --> DrawOfferStore
  GamesService ..> GameAccess
  DrawOfferStore <|.. RedisDrawOfferStore
  DrawOfferStore <|.. MemoryDrawOfferStore
  NotificationsService --> PushService
  PushService ..> MetricsService
```

### 2.4 Diagramme de classes — comptes, matchmaking, lobby

```mermaid
classDiagram
  direction LR

  class AuthController {
    +register(dto)
    +login(dto)
    +oauthLogin(provider, dto)
    +refresh(dto)
    +logout(req, dto)
    +me(req)
    +updateMe(req, dto)
  }
  class AuthService {
    +register(dto) Tokens
    +login(dto) Tokens
    +loginWithOAuth(profile) Tokens
    +refresh(rawToken) Tokens
    +logout(userId, rawToken)
    -issueTokens(user) Tokens
  }
  class OAuthVerifierService {
    +verify(provider, dto) OAuthProfile
  }
  class LobbyGateway {
    +handleJoinQueue(data, socket)
    +handleLeaveQueue(socket)
    +handleCreateRoom(data, socket)
    +handleWaitRoom(data, socket)
    +handleJoinRoom(data, socket)
    +handleDisconnect(socket)
    -runPeriodicMatching()
    -notifyMatch(match)
  }
  class MatchmakingService {
    +enqueue(entry) MatchResult?
    +dequeue(userId, tc)
    +dequeueSocket(userId, socketId) bool
    +tryMatch(userId, tc, elo, range) MatchResult?
    +periodicCheck(tc) MatchResult[]
    +getStatus(userId)
    -lockPlayers(ids, token)
    -createMatch(a, b, tc)
  }
  class RoomsService {
    +create(tc, userId) code+gameId
    +join(code, userId) Game
  }

  AuthController --> AuthService
  AuthController --> OAuthVerifierService
  LobbyGateway --> MatchmakingService
  LobbyGateway --> RoomsService
  LobbyGateway --> RatingsService
  LobbyGateway --> NotificationsService
  MatchmakingService --> PrismaService
  AuthService --> PrismaService
  RoomsService --> PrismaService

  class RatingsService
  class NotificationsService
  class PrismaService
```

---

## 3. Diagrammes de séquence

### 3.1 Connexion et rotation des jetons (sprints 5, 20)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant A as API (AuthService)
  participant DB as PostgreSQL

  C->>A: POST /auth/login {email, password}
  A->>DB: User par e-mail (normalisé)
  A->>A: bcrypt.compare (même coût si compte inconnu)
  A->>DB: RefreshToken {hash SHA-256, expire J+7}
  A-->>C: accessToken (JWT 15 min) + refreshToken + user

  Note over C: 15 min plus tard
  C->>A: POST /auth/refresh {refreshToken}
  A->>DB: RefreshToken par hash
  alt jeton valide
    A->>DB: UPDATE revokedAt = now WHERE revokedAt IS NULL
    Note right of A: rotation atomique :<br/>un seul échange réussit
    A->>DB: nouveau RefreshToken
    A-->>C: nouveau couple de jetons
  else jeton DÉJÀ échangé (copie volée)
    A->>DB: DELETE tous les RefreshToken de l'utilisateur
    A-->>C: 401 — toutes les sessions fermées
  end
```

### 3.2 Matchmaking puis partie classée (sprints 7, 17, 19)

```mermaid
sequenceDiagram
  autonumber
  participant Al as Alice (pod A)
  participant Bo as Bob (pod B)
  participant L as LobbyGateway
  participant MM as MatchmakingService
  participant R as Redis
  participant G as GameGateway
  participant GS as GamesService
  participant DB as PostgreSQL

  Al->>L: lobby:joinQueue {BLITZ}
  L->>MM: enqueue(alice, elo 1200)
  MM->>R: HSET mm:data:alice · ZADD mm:queue:BLITZ
  L-->>Al: lobby:queued
  Bo->>L: lobby:joinQueue {BLITZ}
  L->>MM: enqueue(bob, elo 1210)
  MM->>R: ZRANGEBYSCORE ±300 → alice
  MM->>R: SET NX mm:lock:player:alice / bob
  MM->>R: ZSCORE (toujours en file ?)
  MM->>DB: Game MATCHMAKING ONGOING + 2 entrées MATCHED
  MM->>R: ZREM / DEL · libération des verrous
  L-->>Al: lobby:matchFound {gameId, white, opponent}
  L-->>Bo: lobby:matchFound {gameId, black, opponent}
  Note over L,R: émission par identifiant de socket,<br/>relayée entre pods par l'adaptateur Redis

  Al->>G: game:join {gameId}
  G-->>Al: game:state (playerColor = white)
  Bo->>G: game:join {gameId}
  G-->>Bo: game:state (playerColor = black)

  Al->>G: game:move {e2e4}
  G->>GS: makeMove(gameId, e2e4, alice)
  GS->>GS: joueur ? son tour ? coup légal ?
  GS->>GS: pendule = temps écoulé mesuré par le serveur
  GS->>DB: Move + Game (FEN, pendules)
  G-->>Al: game:moveMade
  G-->>Bo: game:moveMade
```

### 3.3 Fin de partie, Elo et notifications

```mermaid
sequenceDiagram
  autonumber
  participant P as Joueur qui mate
  participant G as GameGateway
  participant GS as GamesService
  participant RS as RatingsService
  participant N as NotificationsService
  participant F as FCM
  participant DB as PostgreSQL

  P->>G: game:move {d8h4}
  G->>GS: makeMove
  GS->>DB: Game FINISHED, BLACK_WIN, CHECKMATE
  GS-)RS: updateAfterGame(gameId) (asynchrone)
  RS->>DB: Rating ×2 (Elo, K = 40 avant 30 parties) + UserStatistics ×2
  G-->>P: game:moveMade + game:ended
  G-)N: notifyGameEnded(game, présents)
  N->>DB: Notification GAME_ENDED ×2
  N->>F: push aux joueurs absents de la partie
```

### 3.4 Déconnexion et forfait (sprints 6, 17, 19)

```mermaid
sequenceDiagram
  autonumber
  participant B as Bob (pod B)
  participant GB as GameGateway pod B
  participant R as Redis (adaptateur)
  participant A as Alice

  B--xGB: perte de connexion
  GB->>R: fetchSockets(room de la partie) sur tous les pods
  alt Bob encore connecté ailleurs (autre onglet, autre pod)
    GB->>GB: rien à faire
  else Bob absent
    GB-->>A: game:opponentDisconnected {graceMs: 30000}
    Note over GB: minuterie 30 s
    alt Bob revient avant 30 s
      B->>GB: game:join
      GB-->>A: game:opponentReconnected
    else toujours absent
      GB->>GB: resign(couleur de Bob, ABANDONED)
      GB-->>A: game:ended {WHITE_WIN, ABANDONED}
    end
  end
```

### 3.5 Coup de l'IA

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant GS as GamesService
  participant AI as AiEngineService (niveaux 1-4)
  participant SC as StockfishClientService
  participant E as ai-engine POST /move
  participant SF as Stockfish

  C->>GS: POST /games/:id/moves {e2e4}
  GS->>GS: coup du joueur validé et enregistré
  alt niveau 1-4
    GS->>AI: getBestMove(fen, niveau)
    Note right of AI: 1 aléatoire · 2 Negamax p.2<br/>3 Alpha-Beta p.4 · 4 IDS + TT + null move
  else niveau 5
    GS->>SC: getBestMove(fen, Elo cible)
    SC->>E: {fen, skillLevel 1-20, movetime}
    E->>SF: position fen … / go movetime …
    SF-->>E: bestmove
    E-->>SC: {uci}
    Note over SC,E: Stockfish injoignable → repli sur le niveau 4
  end
  GS-->>C: {move, aiMove, game}
```

### 3.6 Analyse d'une partie terminée (sprints 8, 18)

```mermaid
sequenceDiagram
  autonumber
  participant C as Client
  participant AS as AnalysisService (API)
  participant Q as Redis / BullMQ
  participant W as AnalysisProcessor (ai-engine)
  participant SF as Stockfish
  participant DB as PostgreSQL

  C->>AS: POST /games/:id/analysis
  AS->>Q: tâche « analyze » (jobId analysis-<gameId>)
  AS-->>C: 202 {jobId}
  Q->>W: tâche
  loop chaque demi-coup
    W->>SF: évaluation avant / après, meilleur coup
    W->>W: perte de probabilité de gain → classification
  end
  W->>DB: GameAnalysis (précisions, évaluations)
  loop toutes les 3 s
    C->>AS: GET /games/:id/analysis
    AS-->>C: processing (progression) puis done
  end
```

Classification d'un coup selon la **chute de probabilité de gain** du joueur : ≥ 30 points gaffe, ≥ 20 erreur, ≥ 10 imprécision ; sinon « théorie » dans les 8 premiers demi-coups, « meilleur coup » si c'est le coup de Stockfish, « bon » sinon.

---

## 4. Diagramme d'états d'une partie

```mermaid
stateDiagram-v2
  [*] --> WAITING: salle privée créée
  [*] --> ONGOING: partie locale / IA / matchmaking
  WAITING --> ONGOING: l'invité rejoint la salle
  ONGOING --> ONGOING: coup joué
  ONGOING --> FINISHED: mat · pat · temps · abandon<br/>nulle (accord, répétition, 50 coups, matériel)<br/>forfait après 30 s d'absence
  FINISHED --> [*]
  note right of FINISHED
    MATCHMAKING : Elo et statistiques
    mis à jour à toute fin de partie
  end note
```

`ABORTED` existe dans le schéma mais n'est attribué par aucun chemin de code aujourd'hui.

---

## 5. Client Flutter

### 5.1 Organisation

```
lib/
├── core/            config (URL, OAuth, Firebase), http (ApiClient), services (SocketService),
│                    settings (réglages + thèmes), theme, widgets communs (avatar, pièce animée)
└── features/        un dossier par fonctionnalité : models / providers / screens / services / widgets
    ├── auth         connexion, inscription, OAuth
    ├── board        plateau, cases, pièces, promotion (BoardPosition, ChessMove)
    ├── game         partie locale et contre l'IA, import FEN / PGN, reprise
    ├── matchmaking  recherche d'adversaire classée
    ├── multiplayer  lobby, salles privées, partie en ligne
    ├── history      « Mes parties »
    ├── replay       lecteur de partie, graphique d'évaluation
    ├── analysis     analyse Stockfish
    ├── leaderboard  classement
    ├── notifications  liste, push FCM
    ├── profile      profil, avatars, statistiques
    ├── settings     réglages
    └── home         accueil
```

### 5.2 État (Riverpod)

```mermaid
flowchart LR
  subgraph Providers
    AP[authProvider<br/>AuthNotifier]
    SP[settingsProvider<br/>SettingsNotifier]
    GP[gameProvider<br/>partie locale / IA]
    MP[multiplayerProvider<br/>partie en ligne]
    MMP[matchmakingProvider]
    NP[notificationsProvider]
  end
  AP -- jeton --> API[ApiClient]
  AP -- jeton --> SOCK[SocketService<br/>/game · /lobby]
  AP --> PUSH[PushService FCM]
  GP --> API
  MP --> SOCK
  MMP --> SOCK
  NP --> API
  SP --> PREFS[(SharedPreferences)]
  AP --> PREFS
  Screens[Écrans] -- ref.watch --> Providers
```

Le jeton d'accès et le refresh token sont stockés dans `SharedPreferences` ; à l'ouverture, `AuthNotifier` restaure la session et renouvelle silencieusement un jeton expiré. Les sockets utilisent exclusivement le transport WebSocket (aucune affinité de session nécessaire côté serveur).

---

## 6. Déploiement

```mermaid
flowchart TB
  U[Joueurs] -->|HTTPS| ING[Ingress NGINX<br/>TLS cert-manager]
  subgraph K8s["Namespace chess"]
    ING -->|/api · /socket.io| APIS[Service api]
    ING -->|/| CLS[Service client]
    APIS --> API1[api pod 1] & API2[api pod 2…12<br/>HPA]
    CLS --> CL[client pods<br/>Nginx non-root]
    API1 & API2 --> AIS[Service ai-engine] --> AI[ai-engine pods]
    API1 & API2 & AI --> PG[(postgres<br/>StatefulSet + PVC)]
    API1 & API2 & AI --> RD[(redis<br/>StatefulSet + AOF)]
    JOB[Job migrate<br/>prisma db push] --> PG
  end
  PROM[Prometheus] -. ServiceMonitor .-> API1 & AI
  GRAF[Grafana] --> PROM
```

Détails : [docs/deployment.md](deployment.md).

---

## 7. Décisions d'architecture

| Décision | Raison | Conséquence |
|---|---|---|
| Serveur autoritaire (chess.js côté API) | anti-triche de base, une seule source de vérité | le client affiche, le serveur décide ; chaque coup en ligne fait un aller-retour |
| Monolithe modulaire NestJS + microservice IA | Stockfish consomme beaucoup de CPU : on le met à l'échelle séparément | un appel HTTP par coup de niveau 5 ; repli sur le niveau 4 si l'IA est indisponible |
| Socket.IO + adaptateur Redis | temps réel bidirectionnel, plusieurs réplicas | Redis obligatoire en production |
| Présence calculée par `fetchSockets()` | un joueur peut être connecté à un autre pod | une requête inter-pods à chaque déconnexion |
| File de matchmaking dans Redis | atomique, partagée, éphémère | une panne Redis vide la file (sans perte de parties) |
| Refresh tokens hachés, révoqués et non supprimés | détecter la réutilisation d'un jeton volé | lignes conservées jusqu'à expiration (purge à chaque émission) |
| Elo par cadence, K dégressif | classement plus juste entre bullet et classique | quatre classements par joueur |
| `prisma db push` (sans migrations versionnées) | schéma simple, projet jeune | un changement destructeur doit être migré à la main ; passer à `prisma migrate` avant la mise en production durable |
