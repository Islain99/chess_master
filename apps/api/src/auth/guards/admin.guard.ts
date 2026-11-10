import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserRole } from '../../common/prisma-enums';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../strategies/jwt.strategy';

/**
 * Novembre 2026 — Routes réservées aux administrateurs (à placer APRÈS
 * JwtAuthGuard). Le rôle est relu en base à chaque requête : retirer le rôle
 * ou désactiver le compte prend effet immédiatement, sans attendre
 * l'expiration du jeton.
 *
 * Nommer un administrateur (sur le serveur) :
 *   docker compose exec postgres psql -U chess chess \
 *     -c "UPDATE \"User\" SET role = 'ADMIN' WHERE email = 'toi@exemple.com';"
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException('Connexion requise.');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, isActive: true },
    });
    if (!user || !user.isActive || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Réservé aux administrateurs.');
    }
    return true;
  }
}
