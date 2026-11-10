# Spécification de l'API REST — Chess Platform

> Sprint 21 : réécrite d'après le code (contrôleurs NestJS). L'ancienne version décrivait des routes inexistantes (`/users/me`, `/games/:id/draw-offer`…).
> Temps réel : [websocket-events.md](websocket-events.md). Modèle de données : [database.md](database.md).

## Conventions

| Élément | Règle |
|---|---|
| Base | `https://<hôte>/api/v1` (exceptions : `GET /metrics`, hors préfixe et non exposé publiquement) |
| Format | JSON (`Content-Type: application/json`), sauf `GET /games/:id/pgn` (texte) |
| Authentification | `Authorization: Bearer <accessToken>` — **JWT** valable 15 min |
| Accès | 🔓 public · 🔐 jeton obligatoire · 🔑 jeton facultatif (identifie le joueur s'il est fourni) · 👮 administrateur (`role = ADMIN`) |
| Validation | corps validés et nettoyés : les champs inconnus sont retirés |
| Limitation de débit | par adresse IP : 10 requêtes/s et 300/min → `429` |
| Énumérations | en MAJUSCULES : `BLITZ`, `MATCHMAKING`, `WHITE_WIN`… |
| Pagination | `?page=` (≥ 1) et `?pageSize=` (1 à 50, 20 par défaut) ; réponse `{ items, total, page, pageSize }` |

### Format des erreurs

```json
{
  "statusCode": 403,
  "error": "NOT_YOUR_TURN",
  "message": "Ce n'est pas à vous de jouer.",
  "timestamp": "2026-11-02T20:15:00.000Z",
  "path": "/api/v1/games/7f0c…/moves"
}
```

Pour une erreur de validation, `message` est une **liste** de messages. Codes métier (`error`) : `AUTH_REQUIRED`, `NOT_A_PLAYER`, `NOT_YOUR_TURN`, `ILLEGAL_MOVE`, `NO_DRAW_OFFER`.

---

## 1. Santé et supervision

| Méthode | Route | Accès | Réponse |
|---|---|---|---|
| GET | `/health` | 🔓 | `200 { status: "ok", timestamp }` — le processus répond (sonde de vivacité) |
| GET | `/health/ready` | 🔓 | `200 { status: "ready", database: "ok" }` ou `503` si la base est injoignable (sonde de disponibilité) |
| GET | `/metrics` *(sans `/api/v1`)* | interne | métriques Prometheus (texte) — non routé par l'ingress |

---

## 2. Authentification (`/auth`)

L'objet `User` renvoyé :

```json
{ "id": "uuid", "email": "alice@mail.com", "displayName": "Alice", "avatarUrl": null,
  "country": "CA", "role": "PLAYER", "authProvider": "LOCAL", "createdAt": "…" }
```

Réponse commune aux connexions (`Tokens`) :

```json
{ "accessToken": "eyJ…", "refreshToken": "uuid", "expiresIn": 900, "user": { … } }
```

### POST /auth/register 🔓
Corps : `{ email, password, displayName }`
- `email` : adresse valide, **normalisée** (espaces retirés, minuscules) ;
- `password` : 8 à 128 caractères ;
- `displayName` : 2 à 32 caractères (espaces de bord retirés).

`201 Tokens` · `400` validation · `409` adresse déjà utilisée (quelle que soit la casse).

### POST /auth/login 🔓
Corps : `{ email, password }` → `200 Tokens`.
`401 « Identifiants invalides. »` (même réponse et même durée que le compte existe ou non) · `401 « Ce compte est désactivé. »`

### POST /auth/refresh 🔓
Corps : `{ refreshToken }` → `200 Tokens` (nouveau couple ; l'ancien refresh token est révoqué).

| Cas | Réponse |
|---|---|
| jeton inconnu | `401 Refresh token invalide.` |
| jeton expiré | `401 Refresh token expiré.` |
| jeton **déjà échangé** (réutilisation : copie volée) | `401` et **toutes les sessions de l'utilisateur sont fermées** |
| deux échanges simultanés du même jeton | un seul réussit |
| compte désactivé | `401` |

### POST /auth/logout 🔐
Corps : `{ refreshToken }` → `204`. Révoque ce refresh token.

### GET /auth/me 🔐
`200 User` (profil privé, avec e-mail).

### PATCH /auth/me 🔐
Corps (tous facultatifs) : `{ displayName?, avatarUrl?, country? }`
- `displayName` : 2 à 32 caractères ;
- `avatarUrl` : `preset:<pièce>-<couleur>` (pièce ∈ `king`, `queen`, `rook`, `bishop`, `knight`, `pawn` ; couleur ∈ `red`, `blue`, `green`, `purple`, `orange`, `teal`), ou URL **HTTPS** (512 caractères au plus) ; `null` → initiales ;
- `country` : code ISO 3166-1 alpha-2 (`CA`) ; `null` efface.

`200 User` · `400` valeur invalide.

### POST /auth/oauth/:provider 🔓
`provider` ∈ `google`, `apple`, `facebook`. Échange un jeton obtenu par le SDK natif du fournisseur contre nos jetons.

Corps : `{ token, nonce?, displayName? }`

| Fournisseur | `token` | `nonce` | Vérification serveur |
|---|---|---|---|
| google | ID token (JWT) | — | signature JWKS Google, `iss`, `aud` ∈ `GOOGLE_CLIENT_IDS`, `exp` |
| apple | identity token (JWT) | nonce brut (le jeton contient son SHA-256) | signature JWKS Apple, `iss`, `aud` ∈ `APPLE_CLIENT_IDS`, `exp`, nonce |
| facebook | access token | — | `/debug_token` (app = `FACEBOOK_APP_ID`) puis `/me` avec `appsecret_proof` |
| facebook (iOS Limited Login) | authentication token (JWT) | nonce brut | signature JWKS Facebook, `iss`, `aud` = `FACEBOOK_APP_ID`, nonce |

`displayName` : Apple seulement (le nom n'est transmis qu'au client, à la première connexion).

Résolution du compte : 1) compte déjà lié au couple (fournisseur, identifiant) ; 2) compte existant de même adresse **si le fournisseur la déclare vérifiée** → liaison (le mot de passe éventuel reste valable) ; 3) sinon création. Une adresse non vérifiée n'est jamais enregistrée.

`200 Tokens` · `400` fournisseur ou corps invalide · `401` jeton invalide, expiré, d'une autre application, ou compte désactivé · `409` adresse liée à un autre fournisseur · `503` fournisseur non configuré.

### POST /auth/oauth/apple/callback 🔓
Appelée par Apple (formulaire) pendant « Sign in with Apple » sur Android et le Web : `303` vers `intent://callback?…#Intent;package=<APPLE_ANDROID_PACKAGE>;scheme=signinwithapple;end`. Aucun jeton n'est vérifié à cette étape.

---

## 3. Joueurs (`/users`)

### GET /users/:id 🔓
Profil public : `{ id, displayName, avatarUrl, country, role, createdAt }` — **sans e-mail**. `404` inconnu.

### GET /users/:id/ratings 🔓
Un élément par cadence déjà jouée en classé :

```json
[{ "id": "…", "userId": "…", "timeControl": "BLITZ", "elo": 1220, "peakElo": 1220,
   "gamesPlayed": 1, "wins": 1, "losses": 0, "draws": 0, "updatedAt": "…" }]
```

### GET /users/:id/statistics 🔐
Statistiques des parties classées : `{ totalGames, totalWins, totalLosses, totalDraws, currentStreak, bestWinStreak }`. Zéros si le joueur n'a pas encore de partie classée.

### GET /users/:id/games?status=ONGOING|FINISHED&page=&pageSize= 🔐
Historique, du plus récent au plus ancien, vu **du côté du joueur** :

```json
{ "items": [{
    "id": "…", "mode": "MATCHMAKING", "timeControl": "BLITZ", "status": "FINISHED",
    "result": "BLACK_WIN", "resultReason": "CHECKMATE",
    "color": "black", "outcome": "win",
    "opponent": { "type": "user", "id": "…", "displayName": "Bob", "avatarUrl": null },
    "moveCount": 4, "createdAt": "…", "endedAt": "…" }],
  "total": 12, "page": 1, "pageSize": 20 }
```

`opponent` : `{ type: "user", … }`, `{ type: "ai", level }` ou `null` (partie locale, ou adversaire en ligne dont le compte a été supprimé). Les parties contre l'IA et les parties locales créées par un joueur connecté lui sont rattachées ; pour une partie locale, `outcome` vaut `null` (le résultat est dans `result`).

### DELETE /users/me 🔐
Suppression définitive du compte connecté (RGPD, Loi 25). Corps :

```json
{ "confirm": "SUPPRIMER", "password": "…" }
```

`password` est exigé pour un compte courriel (`authProvider: LOCAL`), ignoré pour Google / Apple / Facebook. → `204`.

| Erreur | Cas |
|---|---|
| `400` | `confirm` différent de `SUPPRIMER` (casse ignorée) |
| `401` | mot de passe absent ou incorrect |

Effets : sortie de la file de matchmaking ; parties en ligne en cours ou en attente passées à `ABORTED` (sans effet sur l'Elo) ; profil, sessions, appareils push, notifications, classements, statistiques et signalements supprimés. Les parties terminées sont conservées, sans lien avec le compte.

---

## 4. Parties (`/games`) 🔑

Jeton facultatif. Les parties `LOCAL` et `AI` ne contrôlent pas l'identité. Pour les parties en ligne (`PRIVATE`, `MATCHMAKING`), jouer, abandonner et accepter la nulle exigent le jeton d'un **joueur de la partie** ; voir les règles dans [websocket-events.md](websocket-events.md#règles-dautorisation).

L'objet `Game` renvoyé :

```json
{ "id": "…", "mode": "AI", "timeControl": "RAPID", "aiLevel": 3,
  "whitePlayerId": "…", "blackPlayerId": null, "roomCode": null,
  "status": "ONGOING", "result": null, "resultReason": null,
  "fen": "…", "initialFen": "…",
  "clocks": { "white": 600000, "black": 600000 },
  "legalMoves": ["e2e4", "…"],
  "moves": [{ "ply": 1, "san": "e4", "uci": "e2e4", "fenAfter": "…",
              "isCheck": false, "isCheckmate": false, "isCapture": false }] }
```

### POST /games
Corps : `{ mode: "LOCAL" | "AI", timeControl, aiLevel?: 1-5, aiTargetElo?: 100-3200 }`
- `aiLevel` obligatoire en mode `AI` ; `aiTargetElo` (niveau 5) : 1500 par défaut ;
- avec un jeton, la partie IA est rattachée au joueur (blancs) ;
- `PRIVATE` / `MATCHMAKING` → `400` : passer par `/rooms` ou le matchmaking.

`201 Game` (status `ONGOING`).

### GET /games/:id
`200 Game` · `404`. Lisible par tous (spectateurs).

### POST /games/:id/moves
Corps : `{ uci, timeSpentMs? }` — `uci` : `e2e4`, `e7e8q` (promotion).
`timeSpentMs` n'est utilisé qu'en partie locale / IA : en ligne, le temps est mesuré par le serveur.

```json
{ "move":   { "ply": 1, "san": "e4", "uci": "e2e4", "fenAfter": "…", "isCheck": false, "isCheckmate": false, "isCapture": false },
  "aiMove": { "ply": 2, "san": "e5", "uci": "e7e5", … } ,
  "game":   { "status": "ONGOING", "result": null, "resultReason": null, "fen": "…",
              "clocks": { "white": 598000, "black": 600000 }, "legalMoves": ["…"] } }
```

`aiMove` : réponse de l'IA (parties `AI`), sinon `null`.
`400` format UCI invalide ou partie terminée · `401 AUTH_REQUIRED` · `403 NOT_A_PLAYER` / `NOT_YOUR_TURN` · `404` · `422 ILLEGAL_MOVE`.

### POST /games/:id/undo
Partie locale : annule le dernier demi-coup → `200 Game`.

### POST /games/:id/resign
Corps : `{ color: "white" | "black" }` — en ligne, `color` est **ignorée** : c'est le joueur authentifié qui abandonne.
`200` partie terminée (`resultReason: "RESIGNATION"`) · `403` non joueur.

### POST /games/:id/draw
Nulle par accord. Partie locale : immédiate. En ligne : uniquement en réponse à une **proposition de l'adversaire** faite par Socket.IO (`game:drawOffer`).
`200` (`result: "DRAW"`, `resultReason: "DRAW_AGREEMENT"`) · `409 NO_DRAW_OFFER`.

### GET /games/:id/pgn
`200 text/plain` : la partie au format PGN, reconstruite à la demande.

### GET /games/:id/fen
`200 { fen }`.

### POST /games/import
Corps : `{ fen }` (100 caractères au plus) ou `{ pgn }` (100 Ko au plus) → `201 Game` en mode `LOCAL` : en cours, ou terminée si la position finale est un mat, un pat ou une nulle.
`400` ni FEN ni PGN, ou contenu invalide.

---

## 5. Analyse (`/games/:id/analysis`) 🔐

### POST /games/:id/analysis
Met en file une analyse Stockfish (profondeur 15), traitée par le service `ai-engine`.
`202 { jobId, gameId }` · `400` partie en cours · `404`.
Une seule tâche par partie : demander à nouveau pendant le calcul renvoie le même `jobId`.

### GET /games/:id/analysis

| `status` | Corps |
|---|---|
| `not_requested` | `{ status, progress: 0 }` |
| `processing` | `{ status, progress: 0-100 }` |
| `done` | `{ status, engineDepth, accuracyWhite, accuracyBlack, evaluations: [...] }` |

Chaque évaluation : `{ ply, san, uci, player, evalCp, evalWhiteCp, bestUci, classification, … }` ; `classification` ∈ `book`, `best`, `good`, `inaccuracy`, `mistake`, `blunder`, d'après la baisse de **probabilité de gain** du joueur (≥ 10 / 20 / 30 points ; `book` = 8 premiers demi-coups sains).

---

## 6. Matchmaking (`/matchmaking`) 🔐

Le matchmaking s'utilise normalement par Socket.IO (`lobby:joinQueue`), qui notifie l'appariement. Ces routes servent au suivi et aux clients sans socket.

| Méthode | Route | Corps | Réponse |
|---|---|---|---|
| POST | `/matchmaking/join` | `{ timeControl? }` (RAPID par défaut) | `202 { status: "queued", timeControl, elo, queueSize }` |
| DELETE | `/matchmaking/leave` | — | `204` |
| GET | `/matchmaking/status` | — | `{ status: "waiting", queuedAt, elo, timeControl }` ou `{ status: "not_in_queue" }` |

---

## 7. Salles privées (`/rooms`) 🔐

### POST /rooms
Corps : `{ timeControl? }` (RAPID par défaut) → `201 { roomCode, gameId }`. Le créateur a les blancs ; la partie est `WAITING`.

### POST /rooms/:code/join
Code insensible à la casse → `200` partie passée `ONGOING`, l'invité a les noirs.
`404` code inconnu · `409` salle complète, terminée, ou propre salle.

---

## 8. Classement (`/leaderboard`) 🔓

### GET /leaderboard?timeControl=&page=&pageSize=
`timeControl` : `BULLET`, `BLITZ`, `RAPID` (défaut), `CLASSICAL` ; autre valeur → `400`.

```json
{ "items": [{ "rank": 1, "userId": "…", "displayName": "Alice", "avatarUrl": null,
              "elo": 1840, "peakElo": 1872, "gamesPlayed": 54, "wins": 33, "losses": 15,
              "draws": 6, "winRate": 61 }],
  "total": 240, "page": 1, "pageSize": 20, "timeControl": "RAPID" }
```

---

## 9. Notifications (`/notifications`) 🔐

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/notifications?page=&pageSize=` | `{ items: Notification[], total, page, pageSize }` — non lues d'abord, puis les plus récentes |
| GET | `/notifications/unread-count` | `{ count }` |
| PATCH | `/notifications/:id/read` | `{ count }` (0 si la notification n'est pas la vôtre) |
| PATCH | `/notifications/read-all` | `{ count }` |
| POST | `/notifications/devices` | corps `{ token, platform: "ANDROID" \| "IOS" \| "MACOS" \| "WEB" }` → `204` |
| DELETE | `/notifications/devices` | corps `{ token }` → `204` (à appeler avant `/auth/logout`) |
| GET | `/notifications/push-status` | `{ enabled }` : le serveur est-il configuré pour FCM ? |

`Notification` : `{ id, userId, type, payload, isRead, createdAt }`.

Appareils push : `token` est l'identifiant d'installation Firebase reçu par `FirebaseMessaging.onRegistered`. Un jeton n'appartient qu'à un compte (appareil partagé : le dernier connecté) ; au plus 10 appareils par compte, les moins récents sont retirés ; les jetons déclarés invalides par FCM sont supprimés à l'envoi.

### Envois automatiques

| Événement | Type | Destinataire | Push |
|---|---|---|---|
| Coup joué en ligne | `YOUR_TURN` | joueur au trait | seulement s'il n'a pas la partie ouverte (sinon aucune notification) |
| Fin de partie en ligne (mat, nulle, abandon, temps, forfait) | `GAME_ENDED` | chaque joueur | seulement à ceux qui n'ont plus la partie ouverte |
| Adversaire entré dans une salle privée | `GAME_INVITE` | hôte | oui |

---

## 10. Anti-triche (`/admin/cheat-reports`) 👮

Réservé aux comptes `role = ADMIN` (relu en base à chaque requête ; `403` sinon). Nommer un administrateur : voir `docs/deploiement-vps.md`.

Signalements créés automatiquement à la fin des parties **classées** :

| Source | Créé par | Critère |
|---|---|---|
| `TIMING` | API, fin de partie | temps de réflexion mesurés par le serveur, au moins 10 coups (1er coup exclu) : coups < 100 ms, rythme trop régulier, médiane < 200 ms ; score ≥ 50 |
| `ACCURACY` | moteur IA, après l'analyse Stockfish de fond (profondeur 12) | précision ≥ 93 % sur au moins 25 coups |

Un signalement n'est pas une sanction.

| Méthode | Route | Réponse |
|---|---|---|
| GET | `/admin/cheat-reports?status=OPEN\|DISMISSED\|CONFIRMED` | 100 derniers signalements (défaut `OPEN`), avec `user { id, displayName, email, isActive }` |
| PATCH | `/admin/cheat-reports/:id` | corps `{ status: "DISMISSED" \| "CONFIRMED", suspend?: boolean }` → signalement mis à jour |

`CheatReport` : `{ id, userId, gameId, source, score, reasons: string[], status, createdAt, reviewedAt }`.
`suspend: true` avec `CONFIRMED` désactive le compte (`isActive = false`) et révoque ses sessions : connexion et renouvellement refusés.

---

## 11. Récapitulatif des routes

| Méthode | Route | Accès |
|---|---|---|
| GET | `/health`, `/health/ready` | 🔓 |
| POST | `/auth/register`, `/auth/login`, `/auth/refresh` | 🔓 |
| POST | `/auth/oauth/:provider`, `/auth/oauth/apple/callback` | 🔓 |
| POST | `/auth/logout` | 🔐 |
| GET / PATCH | `/auth/me` | 🔐 |
| GET | `/users/:id`, `/users/:id/ratings` | 🔓 |
| GET | `/users/:id/statistics`, `/users/:id/games` | 🔐 |
| DELETE | `/users/me` | 🔐 |
| POST | `/games`, `/games/import` | 🔑 |
| GET | `/games/:id`, `/games/:id/pgn`, `/games/:id/fen` | 🔑 |
| POST | `/games/:id/moves`, `/undo`, `/resign`, `/draw` | 🔑 |
| POST / GET | `/games/:id/analysis` | 🔐 |
| POST / DELETE / GET | `/matchmaking/join`, `/leave`, `/status` | 🔐 |
| POST | `/rooms`, `/rooms/:code/join` | 🔐 |
| GET | `/leaderboard` | 🔓 |
| GET / PATCH / POST / DELETE | `/notifications/*` | 🔐 |
| GET / PATCH | `/admin/cheat-reports` | 👮 |
