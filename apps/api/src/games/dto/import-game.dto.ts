import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportGameDto {
  @IsOptional()
  @IsString()
  @MaxLength(100_000) // sprint 21 : une partie PGN tient largement en 100 Ko
  pgn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fen?: string;
}
