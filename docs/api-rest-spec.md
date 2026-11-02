# Spécification API REST — Jeu d'échecs multiplateforme

Base path : `/api/v1`. Toutes les routes authentifiées attendent un header `Authorization: Bearer <accessToken>`. Les codes d'erreur génériques (`400`, `401`, `403`, `404`, `409`, `422`, `429`, `500`) suivent un corps standard :

```json
{ "statusCode": 422, "error": "ILLEGAL_MOVE", "message": "Ce coup n'est pas légal dans la position actuelle." }
```

## Auth (`/auth`) — public

### POST /auth/register
Body : `{ "email": string, "password": string, "displayName": string }`
201 : `{ "user": User, "accessToken": string, "refreshToken": string }`
409 si l'email existe déjà.

### POST /auth/login
Body : `{ "email": string, "password": string }`
200 : `{ "user": User, "accessToken": string, "refreshToken": string }`
401 si identifiants invalides.

### POST /auth/refresh
Body : `{ "refreshToken": string }`
200 : `{ "accessToken": string, "refreshToken": string }` (rotation du refresh token)
401 si le token est expiré ou révoqué.

### POST /auth/logout — authentifié
Body : `{ "refreshToken": string }`
204. Révoque le refresh token côté serveur.

### POST /auth/oauth/:provider — sprint 15
`provider` ∈ `google | apple | facebook`. Échange un jeton obtenu par le SDK natif du fournisseur contre nos jetons.

Body : `{ "token": string, "nonce"?: string, "displayName"?: string }`

| Fournisseur | `token` | `nonce` | Vérification serveur |
|---|---|---|---|
| google | ID token (JWT) | — | signature JWKS Google, `iss`, `aud` ∈ `GOOGLE_CLIENT_IDS`, `exp` |
| apple | identity token (JWT) | nonce brut (le jeton contient son SHA-256) | signature JWKS Apple, `iss`, `aud` ∈ `APPLE_CLIENT_IDS`, `exp`, nonce |
| facebook | access token | — | `/debug_token` (app_id = `FACEBOOK_APP_ID`) puis `/me` avec `appsecret_proof` |
| facebook (iOS Limited Login) | authentication token (JWT) | nonce brut | signature JWKS Facebook, `iss`, `aud` = `FACEBOOK_APP_ID`, nonce |

`displayName` : Apple seulement (le nom n'est transmis qu'au client, à la première connexion).

200 : `{ "user": User, "accessToken": string, "refreshToken": string, "expiresIn": number }`

Résolution du compte :
1. compte déjà lié au couple (fournisseur, identifiant) ;
2. compte existant avec la même adresse, si le fournisseur la déclare vérifiée → liaison. Le mot de passe éventuel reste valable ;
3. sinon, création d'un compte. Une adresse non vérifiée n'est jamais enregistrée.

Erreurs : 400 fournisseur ou corps invalide · 401 jeton invalide, expiré, d'une autre application, ou compte désactivé · 409 adresse déjà liée à un autre fournisseur · 503 fournisseur non configuré.

### POST /auth/oauth/apple/callback — sprint 15
Appelée par Apple (form-urlencoded) lors de « Sign in with Apple » sur Android et sur le Web. Répond 303 vers `intent://callback?…#Intent;package=<APPLE_ANDROID_PACKAGE>;scheme=signinwithapple;end`. Aucun jeton n'est vérifié à cette étape.

---

## Profil et historique — sprint 18

### PATCH /auth/me — authentifié
Body (tous facultatifs) : `{ "displayName"?: string, "avatarUrl"?: string | null, "country"?: string | null }`
- `displayName` : 2 à 32 caractères ; les espaces sont normalisés ;
- `avatarUrl` : `preset:<pièce>-<couleur>` (pièce ∈ king, queen, rook, bishop, knight, pawn ; couleur ∈ red, blue, green, purple, orange, teal), ou URL **HTTPS** de 512 caractères au plus. `null` revient aux initiales ;
- `country` : code ISO 3166-1 alpha-2 (ex. `CA`). `null` efface la valeur.

400 si une valeur est invalide. Avant ce sprint, le corps n'était pas validé du tout.

### GET /users/:id — public
Profil public : `{ id, displayName, avatarUrl, country, role, createdAt }`. **Sans e-mail** depuis le sprint 18 : avant, l'adresse de n'importe quel joueur était lisible.

### GET /users/:id/games?status=ONGOING|FINISHED&page=&pageSize= — authentifié
`pageSize` est plafonné à 50. Chaque entrée est vue du côté du joueur :
`{ id, mode, timeControl, status, result, resultReason, color: "white"|"black", outcome: "win"|"loss"|"draw"|null, opponent: { type: "user", id, displayName, avatarUrl } | { type: "ai", level } | null, moveCount, createdAt, endedAt }`.
Les parties contre l'IA créées par un joueur connecté lui sont rattachées. Les parties locales restent anonymes.

### Analyse (`GET /games/:id/analysis`)
Chaque évaluation inclut désormais `evalWhiteCp` (point de vue des blancs, utilisé par le graphique) et `player`. La classification se fonde sur la baisse de **probabilité de gain** du joueur (méthode Lichess) : imprécision ≥ 10 points, erreur ≥ 20, gaffe ≥ 30. « Théorie » ne s'applique qu'aux 8 premiers demi-coups **sains**. `brilliant` n'est pas encore détecté (il faudrait repérer les sacrifices).

## Users (`/users`) — authentifié

### GET /users/me
200 : `User` complet (profil privé).

### PATCH /users/me
Body : `{ "displayName"?: string, "avatarUrl"?: string, "country"?: string }`
200 : `User` mis à jour.

### GET /users/:id
200 : `User` public (sans email ni champs sensibles).

### GET /users/:id/statistics
200 : `{ "totalGames": int, "totalWins": int, "totalLosses": int, "totalDraws": int, "currentStreak": int, "bestWinStreak": int }`

### GET /users/:id/ratings
200 : `[{ "timeControl": "bullet"|"blitz"|"rapid"|"classical", "elo": int, "peakElo": int, "gamesPlayed": int }]`

### GET /users/:id/games?status=&mode=&page=&pageSize=
200 : `{ "items": Game[], "total": int, "page": int, "pageSize": int }`

---

## Games (`/games`) — authentification facultative · sprint 17

Jeton facultatif : les parties LOCAL / AI restent anonymes. Pour les parties en ligne (PRIVATE / MATCHMAKING), `moves`, `resign` et `draw` exigent le JWT d'un **joueur de la partie** et appliquent les règles décrites dans `websocket-events.md` (tour, couleur, nulle proposée, pendule serveur). `POST /games` refuse les modes PRIVATE et MATCHMAKING (400) : ces parties se créent via `/rooms` ou le matchmaking. Erreurs : 401 `AUTH_REQUIRED` · 403 `NOT_A_PLAYER` / `NOT_YOUR_TURN` · 409 `NO_DRAW_OFFER`.

### POST /games
Body : `{ "mode": "local"|"ai"|"private"|"matchmaking", "timeControl": "bullet"|"blitz"|"rapid"|"classical", "aiLevel"?: 1-5, "aiTargetElo"?: int }`
201 : `Game` (status `waiting` ou `ongoing` selon le mode).

### GET /games/:id
200 : `Game` avec `currentFen`, `status`, `whiteTimeRemainingMs`, `blackTimeRemainingMs`.
404 si la partie n'existe pas ou n'est pas accessible à l'utilisateur.

### POST /games/:id/moves
Body : `{ "uci": string }` (ex. `"e2e4"`, `"e7e8q"` pour une promotion)
200 : `{ "fenAfter": string, "san": string, "isCheck": bool, "isCheckmate": bool, "clocks": { "white": int, "black": int } }`
422 `ILLEGAL_MOVE` si le coup est invalide dans la position actuelle — revalidation systématique côté serveur via chess.js, indépendamment de ce que le client a animé localement.
409 `NOT_YOUR_TURN` si ce n'est pas le tour du joueur.

### POST /games/:id/resign
204. Termine la partie, `result` = victoire de l'adversaire, `resultReason` = `RESIGNATION`.

### POST /games/:id/draw-offer
204. Notifie l'adversaire via l'événement WebSocket `game:drawOffered`.

### POST /games/:id/draw-response
Body : `{ "accept": boolean }`
204. Si accepté, termine la partie avec `resultReason` = `DRAW_AGREEMENT`.

### GET /games/:id/pgn
200, `Content-Type: text/plain` : la partie au format PGN.

### GET /games/:id/fen
200 : `{ "fen": string }`

### POST /games/import
Body : `{ "pgn"?: string, "fen"?: string }`
201 : `Game` reconstruite, en mode lecture (replay), status `finished`.

### POST /games/:id/analysis
202 : `{ "jobId": string }`. Met en file un job d'analyse Stockfish (file BullMQ, traité par le service ai-engine).

### GET /games/:id/analysis
200 : `{ "engineDepth": int, "accuracyWhite": float, "accuracyBlack": float, "evaluations": [{ "ply": int, "evalCp": int, "classification": "brilliant"|"best"|"good"|"inaccuracy"|"mistake"|"blunder"|"book" }] }`
404 si l'analyse n'a pas encore été demandée ou n'est pas terminée.

---

## Matchmaking (`/matchmaking`) — authentifié

### POST /matchmaking/join
Body : `{ "timeControl": "bullet"|"blitz"|"rapid"|"classical" }`
202 : `{ "queueEntryId": string }`

### DELETE /matchmaking/leave
204.

### GET /matchmaking/status
200 : `{ "status": "waiting"|"matched"|"cancelled", "gameId"?: string }`

---

## Rooms (`/rooms`) — authentifié

### POST /rooms
Body : `{ "timeControl": "bullet"|"blitz"|"rapid"|"classical" }`
201 : `{ "roomCode": string, "gameId": string }`

### POST /rooms/:code/join
200 : `Game`
404 si le code n'existe pas ; 409 si la salle est déjà complète.

---

## Notifications push (`/notifications/devices`) — authentifié · sprint 16

### POST /notifications/devices
Body : `{ "token": string, "platform": "ANDROID" | "IOS" | "MACOS" | "WEB" }`. `token` est l'identifiant d'installation Firebase (FID) reçu par `FirebaseMessaging.onRegistered`.
204. Un même jeton n'appartient qu'à un compte : sur un appareil partagé, il passe au dernier compte connecté. Au plus 10 appareils par compte, les moins récents sont retirés.

### DELETE /notifications/devices
Body : `{ "token": string }` → 204. À appeler avant `POST /auth/logout`.

### GET /notifications/push-status
200 : `{ "enabled": boolean }`. Indique si le serveur est configuré pour FCM.

### Envois automatiques

| Événement | Type | Destinataire | Push |
|---|---|---|---|
| Coup joué en ligne | `YOUR_TURN` | joueur au trait | seulement s'il n'a pas la partie ouverte (aucune notification sinon) |
| Fin de partie (mat, nulle, abandon, temps, déconnexion) | `GAME_ENDED` | chaque joueur humain | seulement à ceux qui n'ont plus la partie ouverte |
| Adversaire entré dans une salle privée | `GAME_INVITE` | hôte | oui |

Les jetons signalés invalides par FCM (application désinstallée) sont supprimés automatiquement.

## Leaderboard (`/leaderboard`) — authentifié

### GET /leaderboard?timeControl=&page=&pageSize=
200 : `{ "items": [{ "userId": string, "displayName": string, "elo": int, "rank": int }], "total": int }`

---

## Notifications (`/notifications`) — authentifié

### GET /notifications?page=&pageSize=
200 : `{ "items": Notification[], "total": int }`

### PATCH /notifications/:id/read
204.

### POST /notifications/devices
Body : `{ "platform": "fcm"|"apns"|"webpush", "token": string }`
204. Enregistre un token pour les notifications push.