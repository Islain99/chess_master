import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { GameMode, TimeControlCategory } from '../../common/prisma-enums';

export class CreateGameDto {
  @IsEnum(GameMode)
  mode: GameMode;

  @IsEnum(TimeControlCategory)
  timeControl: TimeControlCategory;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  aiLevel?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(3200)
  aiTargetElo?: number;
}
