import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail, Trim } from './normalize';

export class RegisterDto {
  @NormalizeEmail() // sprint 20 : une seule adresse quelle que soit la casse
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit comporter au moins 8 caractères.' })
  @MaxLength(128, { message: 'Le mot de passe ne doit pas dépasser 128 caractères.' })
  password: string;

  @Trim()
  @IsString()
  @Length(2, 32, { message: 'Le nom d\'affichage doit comporter entre 2 et 32 caractères.' })
  displayName: string;
}
