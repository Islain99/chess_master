import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // Squelette sprint 0 : profil, statistiques et classements par cadence
  // arrivent au sprint 5 (comptes utilisateurs).
  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
