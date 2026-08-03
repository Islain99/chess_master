import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  email: string;

  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit comporter au moins 8 caractères.' })
  password: string;

  @IsString()
  @Length(2, 32, { message: 'Le nom d\'affichage doit comporter entre 2 et 32 caractères.' })
  displayName: string;
}
