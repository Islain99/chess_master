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

### GET /auth/oauth/:provider
`provider` ∈ `google | apple | facebook`. Redirige vers le fournisseur OAuth2.

### GET /auth/oauth/:provider/callback
200 : `{ "user": User, "accessToken": string, "refreshToken": string }`

---

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

## Games (`/games`) — authentifié

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