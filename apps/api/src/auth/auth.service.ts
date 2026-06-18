import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // Squelette sprint 0 : la logique complete (hachage Argon2, emission des
  // JWT access/refresh, OAuth2 Google/Apple/Facebook) arrive au sprint 5.
  async register(_input: RegisterInput) {
    throw new Error('AuthService.register: a implementer au sprint 5.');
  }
}
