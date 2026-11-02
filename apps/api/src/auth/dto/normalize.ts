// ─────────────────────────────────────────────────────────────────────────────
// Sprint 20 — Normalisation des champs d'authentification
//
// « Alice@Mail.com » et « alice@mail.com » créaient deux comptes distincts, et
// la connexion échouait si la casse différait de l'inscription.
// ─────────────────────────────────────────────────────────────────────────────
import { Transform } from 'class-transformer';

/** E-mail sans espaces et en minuscules (appliqué avant la validation). */
export const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));

/** Texte sans espaces de début / fin. */
export const Trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
