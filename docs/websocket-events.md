# Événements WebSocket — Chess Platform

> Sprint 21 : catalogue revu d'après le code (`GameGateway`, `LobbyGateway`) et correction de `game:state` (voir plus bas). Retirés car jamais émis : `notification:new`, `lobby:inviteError`. Ajoutés : `lobby:queued`, `lobby:leftQueue`, `lobby:waitRoom` / `lobby:waiting`, `lobby:roomJoined`, `lobby:opponentJoined`, `lobby:error`.

Transport : **Socket.IO 4**, transport WebSocket uniquement côté client. Deux namespaces :

| Namespace | Rôle |
|---|---|
| `/game` | déroulement d'une partie (coups, abandon, nulle, déconnexions) |
| `/lobby` | matchmaking et salles privées |

Séquences complètes : [architecture.md](architecture.md#3-diagrammes-de-séquence).

## Connexion et authentification

```js
const socket = io('https://chess.example.com/game', {
  transports: ['websocket'],
  auth: { token: accessToken },   // facultatif
});
```

Le JWT est vérifié à la connexion. Un socket sans jeton (ou avec un jeton invalide) est accepté **en anonyme** : il peut suivre une partie en spectateur, sans jamais y agir, et ne peut pas utiliser le matchmaking.

Plusieurs réplicas de l'API : les émissions et la présence passent par l'adaptateur Socket.IO **Redis**, un client peut être servi par n'importe quel pod (pas d'affinité de session).

## Règles d'autorisation

Appliquées par `GamesService`, donc identiques pour Socket.IO et l'API REST.

| Action | Partie LOCAL / AI | Partie en ligne (PRIVATE / MATCHMAKING) |
|---|---|---|
| Jouer un coup | libre | joueur authentifié, **pour sa couleur et à son tour** (`AUTH_REQUIRED`, `NOT_A_PLAYER`, `NOT_YOUR_TURN`) |
| Temps consommé | `timeSpentMs` du client | **mesuré par le serveur** depuis le coup précédent ; la valeur du client est ignorée |
| Abandonner | couleur indiquée | **sa propre couleur** ; le champ `color` est ignoré |
| Proposer la nulle | — | joueur uniquement |
| Accepter la nulle | immédiat | uniquement une proposition **de l'adversaire** encore valable (`NO_DRAW_OFFER`) ; un coup joué annule la proposition |
| Forfait après déconnexion | — | joueur seulement (jamais un spectateur), **sans aucun autre socket ouvert sur la partie, sur aucun pod**, absent 30 s → `ABANDONED` |

En partie classée (MATCHMAKING), l'Elo et les statistiques sont recalculés à **toute** fin de partie : mat, pat, temps, abandon, nulle, forfait.

Limitation : 20 coups par socket et par tranche de 5 s (au-delà : `game:invalidMove` avec `RATE_LIMITED`).

---

## Namespace `/game`

### Client → serveur

| Événement | Payload | Description |
|---|---|---|
| `game:join` | `{ gameId }` | Rejoindre la room `game:<gameId>` (joueur ou spectateur). À refaire après chaque reconnexion |
| `game:move` | `{ gameId, uci, timeSpentMs? }` | Jouer un coup (`e2e4`, `e7e8q`), revalidé par chess.js |
| `game:resign` | `{ gameId, color? }` | Abandonner (`color` ne sert qu'aux parties locales) |
| `game:drawOffer` | `{ gameId }` | Proposer la nulle |
| `game:drawResponse` | `{ gameId, accept }` | Accepter ou refuser la proposition de l'adversaire |

### Serveur → client

| Événement | Destinataires | Payload |
|---|---|---|
| `game:state` | à chaque `game:join` : au socket qui rejoint **avec** `playerColor` ; aux autres membres de la room **sans** `playerColor` (l'hôte voit ainsi l'adversaire arriver) | objet `Game` de l'API REST ; `playerColor` = `"white"`, `"black"` ou `null` (spectateur). Sprint 21 : auparavant la couleur de l'arrivant était envoyée à toute la room, et le client des blancs basculait en « noirs » à l'arrivée de l'adversaire |
| `game:moveMade` | room | `{ move, aiMove, game: { status, result, resultReason, fen, clocks, legalMoves } }` (même corps que `POST /games/:id/moves`) |
| `game:invalidMove` | auteur seulement | `{ reason, message?, uci }` — `reason` ∈ `ILLEGAL_MOVE`, `NOT_YOUR_TURN`, `NOT_A_PLAYER`, `AUTH_REQUIRED`, `RATE_LIMITED`, `BadRequest…` (partie terminée) |
| `game:error` | auteur seulement | `{ error, message }` — abandon, proposition ou réponse de nulle refusés (`NOT_A_PLAYER`, `NO_DRAW_OFFER`…) ou partie introuvable au `game:join` |
| `game:ended` | room | `{ result, reason }` — `result` ∈ `WHITE_WIN`, `BLACK_WIN`, `DRAW` ; `reason` ∈ `ResultReason` |
| `game:drawOffered` | room sauf l'auteur | `{ by: "white" \| "black" }` |
| `game:drawDeclined` | room sauf l'auteur | `{}` |
| `game:opponentDisconnected` | room sauf le partant | `{ graceMs: 30000 }` — le joueur n'a plus aucun socket sur la partie |
| `game:opponentReconnected` | room sauf le revenant | `{}` — retour avant la fin du délai |

### Exemple : partie en ligne

```js
socket.emit('game:join', { gameId });
socket.on('game:state', (s) => { /* position, pendules, ma couleur */ });

socket.emit('game:move', { gameId, uci: 'e2e4' });
socket.on('game:moveMade', ({ move, game }) => { /* appliquer */ });
socket.on('game:invalidMove', ({ reason }) => { /* annuler l'animation locale */ });
socket.on('game:ended', ({ result, reason }) => { /* fin */ });
```

---

## Namespace `/lobby`

### Client → serveur

| Événement | Payload | Description |
|---|---|---|
| `lobby:joinQueue` | `{ timeControl? }` (RAPID par défaut) | Entrer dans la file de matchmaking — **compte obligatoire** |
| `lobby:leaveQueue` | `{}` | Quitter la file |
| `lobby:createRoom` | `{ timeControl? }` | Créer une salle privée (créateur = blancs) |
| `lobby:waitRoom` | `{ roomCode }` | L'hôte attend dans sa salle (pour être prévenu de l'arrivée de l'invité) |
| `lobby:joinRoom` | `{ roomCode }` | Rejoindre une salle par son code (invité = noirs) |

### Serveur → client

| Événement | Destinataires | Payload |
|---|---|---|
| `lobby:queued` | demandeur | `{ timeControl, elo, message }` — inscrit dans la file |
| `lobby:matchFound` | chacun des deux joueurs | `{ gameId, color: "white" \| "black", opponent: { elo, displayName }, timeControl }` |
| `lobby:leftQueue` | demandeur | — |
| `lobby:roomCreated` | créateur | `{ roomCode, gameId }` |
| `lobby:waiting` | hôte | `{ roomCode }` |
| `lobby:roomJoined` | invité | `{ gameId, roomCode }` |
| `lobby:opponentJoined` | hôte (room d'attente) | `{ gameId }` — l'hôte reçoit aussi une notification `GAME_INVITE` (et un push) |
| `lobby:error` | demandeur | `{ message }` — matchmaking anonyme, code inconnu, salle complète, propre salle… |

### Matchmaking

1. `lobby:joinQueue` → `lobby:queued`.
2. Le serveur cherche immédiatement un adversaire de la même cadence à **±300 Elo** ; sinon il réessaie toutes les **10 s** en élargissant la plage de **100 Elo par 30 s d'attente**.
3. Appariement → `lobby:matchFound` aux deux joueurs (couleurs tirées au sort), qui rejoignent ensuite la partie sur `/game`.
4. **Se déconnecter du lobby retire de la file** (sprint 20), sauf si le joueur s'est réinscrit depuis un autre socket. La file expire de toute façon après 5 min.

Plusieurs pods vérifient la file en même temps : un verrou Redis par joueur garantit qu'un joueur n'est apparié qu'une fois.

---

## Mise en œuvre

| Élément | Fichier |
|---|---|
| Gateways | `apps/api/src/realtime/game.gateway.ts`, `lobby.gateway.ts` |
| Adaptateur Redis | `apps/api/src/realtime/redis-io.adapter.ts` |
| Limitation des coups | `apps/api/src/realtime/ws-throttler.ts` |
| Client Flutter | `apps/client/lib/core/services/socket_service.dart` |
| Tests end-to-end | `apps/api/test/realtime.e2e-spec.ts`, `multi-replica.e2e-spec.ts` |

Pas encore implémentés : la revanche et la diffusion périodique des pendules. Un joueur qui ne joue plus ne perd au temps qu'au coup suivant ou après 30 s de déconnexion.
