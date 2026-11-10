import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthModule } from '../auth/auth.module';
import { MatchmakingModule } from '../matchmaking/matchmaking.module';
import { AccountService } from './account.service';

@Module({
  imports: [AuthModule, MatchmakingModule],
  controllers: [UsersController],
  providers: [UsersService, AccountService],
  exports: [UsersService],
})
export class UsersModule {}
