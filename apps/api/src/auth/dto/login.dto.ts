import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from './normalize';

export class LoginDto {
  @NormalizeEmail() // sprint 20
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  // Sprint 20 : bcrypt ignore tout au-delà de 72 octets ; on borne pour éviter
  // de hacher des corps de plusieurs Mo à chaque tentative.
  @MaxLength(128)
  password: string;
}
