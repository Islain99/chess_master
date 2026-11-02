# Catalogue des événements WebSocket — Jeu d'échecs multiplateforme

Transport : Socket.IO. Deux namespaces : `/game` (déroulement d'une partie) et `/lobby` (matchmaking, salles privées, notifications).

## Handshake et authentification

```js
const socket = io('/game', { auth: { token: accessToken } });
```

Le JWT est vérifié à la connexion. Un socket sans jeton (ou avec un jeton invalide) est accepté, mais en **anonyme** : il peut suivre une partie, sans jamais y agir. Le client émet ensuite `game:join` avec le `gameId`. Le serveur l'ajoute à la room `game:{gameId}` et diffuse l'état complet via `game:state` (y compris après une reconnexion automatique). Un utilisateur qui n'est pas joueur de la partie la rejoint comme **spectateur**.

## Règles d'autorisation (sprint 17)

Elles sont appliquées par `GamesService`, donc identiques pour Socket.IO et l'API REST.

| Action | Partie LOCAL / AI | Partie en ligne (PRIVATE / MATCHMAKING) |
|---|---|---|
| Jouer un coup | libre | joueur authentifié, **pour sa couleur et à son tour** (`NOT_YOUR_TURN`, `NOT_A_PLAYER`, `AUTH_REQUIRED`) |
| Temps consommé | valeur `timeSpentMs` du client | **mesuré par le serveur** (temps écoulé depuis le coup précédent) ; la valeur du client est ignorée |
| Abandonner | couleur indiquée | **sa propre couleur uniquement**. Le champ `color` est ignoré |
| Proposer la nulle | — | joueur uniquement |
| Accepter la nulle | immédiat | uniquement une proposition **de l'adversaire** encore valable (`NO_DRAW_OFFER`). Un coup joué annule la proposition |
| Forfait après déconnexion | — | joueur seulement (pas un spectateur), sans autre socket ouvert sur la partie, absent 30 s → `ABANDONED` |

En partie classée (MATCHMAKING), l'Elo est recalculé à **toute** fin de partie : mat, pat, temps, abandon, nulle, forfait.

## Namespace `/game`

### Client → Serveur

| Événement | Payload | Description |
|---|---|---|
| `game:join` | `{ gameId: string }` | Rejoindre la room d'une partie (joueur ou spectateur) |
| `game:move` | `{ gameId: string, uci: string, timeSpentMs?: int }` | Tenter un coup, revalidé par chess.js et par les règles ci-dessus |
| `game:resign` | `{ gameId: string, color?: "white"\|"black" }` | Abandonner (`color` sert seulement aux parties locales) |
| `game:drawOffer` | `{ gameId: string }` | Proposer la nulle |
| `game:drawResponse` | `{ gameId: string, accept: boolean }` | Répondre à une offre de nulle |

### Serveur → Client

| Événement | Payload | Description |
|---|---|---|
| `game:state` | état complet de la partie + `playerColor` | Envoyé au `game:join` |
| `game:moveMade` | `{ move, aiMove, game: { status, result, resultReason, fen, clocks, legalMoves } }` | Coup validé, diffusé à la room |
| `game:invalidMove` | `{ reason: string, message?: string, uci: string }` | Coup rejeté (`ILLEGAL_MOVE`, `NOT_YOUR_TURN`, `NOT_A_PLAYER`, `AUTH_REQUIRED`, `RATE_LIMITED`), envoyé à son seul auteur |
| `game:error` | `{ error: string, message: string }` | Action refusée (abandon, nulle…), envoyée à son seul auteur |
| `game:ended` | `{ result: string, reason: string }` | Fin de partie |
| `game:opponentDisconnected` | `{ graceMs: int }` | Délai de reconnexion avant forfait |
| `game:opponentReconnected` | `{}` | L'adversaire est de retour |
| `game:drawOffered` | `{ by: "white"\|"black" }` | Offre de nulle de l'adversaire |
| `game:drawDeclined` | `{}` | Offre refusée |

> Pas encore implémentés : la revanche (`game:rematchRequest`) et la diffusion périodique des pendules (`game:clockSync`). Un joueur qui ne joue plus ne perd au temps qu'au coup suivant ou après 30 s de déconnexion.

## Namespace `/lobby`

### Client → Serveur

| Événement | Payload | Description |
|---|---|---|
| `lobby:joinQueue` | `{ timeControl: string }` | Rejoindre la file de matchmaking |
| `lobby:leaveQueue` | `{}` | Quitter la file |
| `lobby:createRoom` | `{ timeControl: string }` | Créer une salle privée |
| `lobby:joinRoom` | `{ roomCode: string }` | Rejoindre une salle via son code |

### Serveur → Client

| Événement | Payload | Description |
|---|---|---|
| `lobby:matchFound` | `{ gameId: string, opponent: { displayName: string, elo: int }, color: "white"\|"black" }` | Adversaire trouvé |
| `lobby:roomCreated` | `{ roomCode: string, gameId: string }` | Code de salle généré |
| `lobby:inviteError` | `{ reason: string }` | Code invalide ou salle déjà complète |
| `notification:new` | `{ type: string, data: object }` | Invitation, tour du joueur, fin de partie — relayé en push si l'utilisateur est hors-ligne |

## Notes d'implémentation

L'adapter Redis (`@socket.io/redis-adapter`) est requis dès que l'API tourne sur plusieurs pods : sans lui, deux joueurs connectés à des pods différents ne reçoivent pas les diffusions de room de l'un vers l'autre. Le rate limiting des événements (notamment `game:move`) passe par un middleware dédié plutôt que par le Throttler HTTP, qui ne s'applique pas aux connexions WebSocket persistantes.