// ─────────────────────────────────────────────────────────────────────────────
// Sprint 17 — Règles d'autorisation des actions de jeu
//
// Une seule source de vérité, appliquée par GamesService : l'API REST et la
// gateway Socket.IO passent par les mêmes contrôles.
//
//   • Parties LOCAL / AI : anonymes et jouées sur un seul appareil → aucune
//     restriction (l'identifiant de partie fait office de jeton).
//   • Parties en ligne (PRIVATE / MATCHMAKING) :
//       – seul un joueur de la partie peut agir (identité = JWT) ;
//       – il ne peut jouer que pour SA couleur, et seulement à son tour ;
//       – il ne peut abandonner que pour lui-même ;
//       – il ne peut accepter qu'une nulle proposée par son adversaire.
// ─────────────────────────────────────────────────────────────────────────────
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { GameMode } from '../common/prisma-enums';

export type Seat = 'white' | 'black';

/**
 * Auteur d'une action.
 * `system` : action décidée par le serveur lui-même (forfait après
 * déconnexion) — jamais construit à partir d'une requête client.
 */
export interface Actor {
  userId?: string;
  system?: boolean;
}

/** Acteur « serveur », réservé aux traitements internes. */
export const SYSTEM_ACTOR: Readonly<Actor> = Object.freeze({ system: true });

interface SeatedGame {
  mode: GameMode;
  whitePlayerId: string | null;
  blackPlayerId: string | null;
}

/** Parties où deux comptes s'affrontent à distance. */
export function isOnlineGame(mode: GameMode): boolean {
  return mode === GameMode.PRIVATE || mode === GameMode.MATCHMAKING;
}

export function opposite(seat: Seat): Seat {
  return seat === 'white' ? 'black' : 'white';
}

/** Couleur au trait d'après le FEN (2ᵉ champ). */
export function turnOf(fen: string): Seat {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** Couleur de l'utilisateur dans la partie, ou null s'il n'y joue pas. */
export function seatOf(game: SeatedGame, userId?: string): Seat | null {
  if (!userId) return null;
  if (game.whitePlayerId === userId) return 'white';
  if (game.blackPlayerId === userId) return 'black';
  return null;
}

/**
 * Partie en ligne : renvoie la couleur de l'acteur, ou lève 401/403.
 * Ne doit être appelée que pour une partie en ligne.
 */
export function requirePlayer(game: SeatedGame, actor: Actor | undefined): Seat {
  if (!actor?.userId) {
    throw new UnauthorizedException({
      error: 'AUTH_REQUIRED',
      message: 'Connectez-vous pour agir dans une partie en ligne.',
    });
  }
  const seat = seatOf(game, actor.userId);
  if (!seat) {
    throw new ForbiddenException({
      error: 'NOT_A_PLAYER',
      message: 'Vous ne participez pas à cette partie.',
    });
  }
  return seat;
}

/** Partie en ligne : l'acteur doit être le joueur au trait. */
export function assertCanMove(game: SeatedGame & { currentFen: string }, actor: Actor | undefined): Seat {
  const seat = requirePlayer(game, actor);
  if (turnOf(game.currentFen) !== seat) {
    throw new ForbiddenException({
      error: 'NOT_YOUR_TURN',
      message: 'Ce n\'est pas à vous de jouer.',
    });
  }
  return seat;
}
