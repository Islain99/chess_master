import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { AuthModule } from '../auth/auth.module';
import { FcmService } from './push/fcm.service';
import { PushService } from './push/push.service';

@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  // Sprint 16 : envoi push via Firebase Cloud Messaging
  providers: [NotificationsService, PushService, FcmService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
