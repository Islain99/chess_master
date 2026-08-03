import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** GET /notifications — liste paginée */
  @Get()
  list(
    @Req() req: Request,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const user = req.user as RequestUser;
    return this.notifications.list(
      user.userId,
      page ? parseInt(page) : 1,
      pageSize ? parseInt(pageSize) : 20,
    );
  }

  /** GET /notifications/unread-count */
  @Get('unread-count')
  unreadCount(@Req() req: Request) {
    const user = req.user as RequestUser;
    return this.notifications.unreadCount(user.userId).then((count) => ({ count }));
  }

  /** PATCH /notifications/:id/read — marquer comme lu */
  @Patch(':id/read')
  markRead(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as RequestUser;
    return this.notifications.markRead(id, user.userId);
  }

  /** PATCH /notifications/read-all */
  @Patch('read-all')
  markAllRead(@Req() req: Request) {
    const user = req.user as RequestUser;
    return this.notifications.markAllRead(user.userId);
  }
}
