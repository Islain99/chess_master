import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { RoomsService } from './rooms.service';
import { TimeControlCategory } from '../common/prisma-enums';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** POST /rooms — créer une salle privée */
  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Req() req: Request,
    @Body() body: { timeControl?: TimeControlCategory },
  ) {
    const user = req.user as RequestUser;
    return this.rooms.create(
      body.timeControl ?? TimeControlCategory.RAPID,
      user.userId,
    );
  }

  /** POST /rooms/:code/join — rejoindre une salle par son code */
  @Post(':code/join')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  join(@Param('code') code: string, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.rooms.join(code, user.userId);
  }
}
