# Catalogue des événements WebSocket — Jeu d'échecs multiplateforme

Transport : Socket.IO. Deux namespaces : `/game` (déroulement d'une partie) et `/lobby` (matchmaking, salles privées, notifications).

## Handshake et authentification

```js
const socket = io('/game', { auth: { token: accessToken } });
```

Le serveur valide le JWT avant d'accepter la connexion (middleware `io.use(...)`). Pour `/game`, le client doit ensuite émettre `game:join` avec le `gameId` ; le serveur vérifie que l'utilisateur est bien un participant de cette partie avant de le faire rejoindre la room `game:{gameId}`, et renvoie l'état complet via `game:state`. Cette étape est systématique, y compris après une reconnexion automatique gérée par Socket.IO — aucun état n'est reconstruit côté client par accumulation de diffs, ce qui élimine les divergences après une coupure réseau.

## Namespace `/game`

### Client → Serveur

| Événement | Payload | Description |
|---|---|---|
| `game:join` | `{ gameId: string }` | Rejoindre la room d'une partie |
| `game:move` | `{ gameId: string, uci: string }` | Tenter un coup — revalidé côté serveur via chess.js |
| `game:resign` | `{ gameId: string }` | Abandonner |
| `game:drawOffer` | `{ gameId: string }` | Proposer la nulle |
| `game:drawResponse` | `{ gameId: string, accept: boolean }` | Répondre à une offre de nulle |
| `game:rematchRequest` | `{ gameId: string }` | Demander une revanche |

### Serveur → Client

| Événement | Payload | Description |
|---|---|---|
| `game:state` | `{ fen: string, moves: Move[], status: string, clocks: { white: int, black: int } }` | État complet, envoyé à la connexion/reconnexion |
| `game:moveMade` | `{ move: Move, fenAfter: string, clocks: { white: int, black: int } }` | Coup validé, diffusé aux deux joueurs |
| `game:invalidMove` | `{ reason: string }` | Coup rejeté, renvoyé uniquement à son auteur |
| `game:ended` | `{ result: string, reason: string }` | Fin de partie |
| `game:opponentDisconnected` | `{ graceMs: int }` | Délai de reconnexion avant forfait |
| `game:opponentReconnected` | `{}` | L'adversaire est de retour |
| `game:drawOffered` | `{}` | Notifie l'adversaire d'une offre de nulle |
| `game:clockSync` | `{ white: int, black: int, serverTime: int }` | Diffusion périodique des horloges serveur-autoritatives |

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