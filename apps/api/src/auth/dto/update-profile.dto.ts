import { Transform } from 'class-transformer';
import {
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Length,
  registerDecorator,
  ValidateIf,
  ValidationOptions,
} from 'class-validator';
import { isValidAvatar } from '../../users/avatar-presets';

/** Valide un avatar : « preset:<id> » connu ou URL HTTPS (cf. avatar-presets.ts). */
function IsAvatar(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isAvatar',
      target: object.constructor,
      propertyName,
      options: {
        message: 'avatarUrl doit être un avatar prédéfini (preset:…) ou une URL HTTPS.',
        ...options,
      },
      validator: { validate: (value: unknown) => isValidAvatar(value) },
    });
}

/**
 * Sprint 18 — Corps de PATCH /auth/me.
 * Avant : objet libre, sans aucune validation (nom vide ou de 10 000
 * caractères, avatar « javascript:… », pays arbitraire…).
 * `null` sur avatarUrl / country = effacer la valeur.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value))
  @Length(2, 32, { message: 'Le nom d\'affichage doit comporter entre 2 et 32 caractères.' })
  displayName?: string;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsAvatar()
  avatarUrl?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Transform(({ value }) => (typeof value === 'string' ? value.toUpperCase() : value))
  @IsISO31661Alpha2({ message: 'country doit être un code pays ISO 3166-1 (ex. « CA »).' })
  country?: string | null;
}
