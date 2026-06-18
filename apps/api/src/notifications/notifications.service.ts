import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Squelette sprint 0. Notifications push (FCM/APNs/Web Push) au sprint 8.
}
