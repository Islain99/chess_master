import { IsOptional, IsString } from 'class-validator';

export class ImportGameDto {
  @IsOptional()
  @IsString()
  pgn?: string;

  @IsOptional()
  @IsString()
  fen?: string;
}
