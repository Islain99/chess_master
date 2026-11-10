import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';

describe('AdminGuard', () => {
  const ctx = (user?: { userId: string }) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

  function guard(dbUser: unknown) {
    return new AdminGuard({ user: { findUnique: jest.fn().mockResolvedValue(dbUser) } } as any);
  }

  it('administrateur actif : accès', async () => {
    await expect(guard({ role: 'ADMIN', isActive: true }).canActivate(ctx({ userId: 'a' }))).resolves.toBe(true);
  });

  it('joueur : 403', async () => {
    await expect(guard({ role: 'PLAYER', isActive: true }).canActivate(ctx({ userId: 'a' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('administrateur suspendu : 403', async () => {
    await expect(guard({ role: 'ADMIN', isActive: false }).canActivate(ctx({ userId: 'a' }))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('sans jeton : 401', async () => {
    await expect(guard(null).canActivate(ctx())).rejects.toThrow(UnauthorizedException);
  });
});
