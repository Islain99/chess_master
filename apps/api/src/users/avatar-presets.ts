// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Avatars prédéfinis
//
// Un avatar est soit un préréglage « preset:<id> » (dessiné par le client :
// pièce + couleur, aucun fichier à héberger), soit une URL HTTPS (photo
// fournie par Google / Facebook lors d'une connexion OAuth).
// La liste doit rester identique à lib/core/widgets/player_avatar.dart.
// ─────────────────────────────────────────────────────────────────────────────

const PIECES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'] as const;
const COLORS = ['red', 'blue', 'green', 'purple', 'orange', 'teal'] as const;

/** 36 combinaisons pièce × couleur, ex. « knight-blue ». */
export const AVATAR_PRESETS: readonly string[] = PIECES.flatMap((p) => COLORS.map((c) => `${p}-${c}`));

const PRESET_PREFIX = 'preset:';
const MAX_URL_LENGTH = 512;

/** Valeur acceptée pour User.avatarUrl (hors null = retour à l'avatar par initiales). */
export function isValidAvatar(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.startsWith(PRESET_PREFIX)) {
    return AVATAR_PRESETS.includes(value.slice(PRESET_PREFIX.length));
  }
  if (value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    // HTTPS uniquement : pas de http (pistage en clair), data:, javascript:…
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
