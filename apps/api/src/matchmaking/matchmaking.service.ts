import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MatchmakingService {
  constructor(private readonly prisma: PrismaService) {}

  // Squelette sprint 0. La file Redis et l'appariement par Elo arrivent
  // au sprint 7.
}
