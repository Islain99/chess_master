import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class MakeMoveDto {
  // UCI : "e2e4", "e7e8q" pour promotion
  @IsString()
  @Matches(/^[a-h][1-8][a-h][1-8][qrbnQRBN]?$/, {
    message: 'Format UCI invalide. Exemples : "e2e4", "e7e8q".',
  })
  uci: string;

  // Temps passé sur le coup côté client (utilisé pour déduire l'horloge)
  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentMs?: number;
}
