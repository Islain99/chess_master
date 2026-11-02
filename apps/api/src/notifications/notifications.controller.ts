import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { RegisterPushDeviceDto, UnregisterPushDeviceDto } from './dto/push-device.dto';
import { NotificationsService } from './notifications.service';
import { PushService } from './push/push.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly push: PushService,
  ) {}

  // ─── Appareils push (sprint 16) ────────────────────────────────────────────

  /** POST /notifications/devices — abonner cet appareil aux notifications push */
  @Post('devices')
  @HttpCode(204)
  async registerDevice(@Req() req: Request, @Body() dto: RegisterPushDeviceDto) {
    const user = req.user as RequestUser;
    await this.push.registerDevice(user.userId, dto.token, dto.platform);
  }

  /** DELETE /notifications/devices — désabonner cet appareil (déconnexion) */
  @Delete('devices')
  @HttpCode(204)
  async unregisterDevice(@Req() req: Request, @Body() dto: UnregisterPushDeviceDto) {
    const user = req.user as RequestUser;
    await this.push.unregisterDevice(user.userId, dto.token);
  }

  /** GET /notifications/push-status — le serveur sait-il envoyer des push ? */
  @Get('push-status')
  pushStatus() {
    return { enabled: this.push.enabled };
  }

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
