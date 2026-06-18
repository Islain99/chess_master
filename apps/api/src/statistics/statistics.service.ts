import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  // Squelette sprint 0. Consomme par UsersController
  // (GET /users/:id/statistics) a partir du sprint 8.
}
