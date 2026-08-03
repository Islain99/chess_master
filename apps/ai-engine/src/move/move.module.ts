import { Module } from '@nestjs/common';
import { MoveController } from './move.controller';
import { MoveService } from './move.service';

@Module({
  controllers: [MoveController],
  providers: [MoveService],
})
export class MoveModule {}
