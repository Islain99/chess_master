// ─────────────────────────────────────────────────────────────────────────────
// Sprint 15 — Tests de AuthService.loginWithOAuth (création / liaison de compte)
// ─────────────────────────────────────────────────────────────────────────────
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { AuthProvider, UserRole } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { OAuthProfile } from './oauth/oauth.types';

const baseUser = {
  id: 'u-1',
  email: 'alice@example.com',
  passwordHash: null as string | null,
  displayName: 'Alice',
  avatarUrl: null as string | null,
  country: null,
  role: UserRole.PLAYER,
  authProvider: AuthProvider.GOOGLE as AuthProvider,
  providerId: 'g-123' as string | null,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const googleProfile: OAuthProfile = {
  provider: AuthProvider.GOOGLE,
  providerId: 'g-123',
  email: 'Alice@Example.com',
  emailVerified: true,
  displayName: 'Alice G.',
  avatarUrl: 'https://pic',
};

const prisma = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  refreshToken: { create: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
};
const jwt = { sign: jest.fn().mockReturnValue('access-token') };

describe('AuthService.loginWithOAuth', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.refreshToken.create.mockResolvedValue({});
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('compte déjà lié : connexion directe, lastLoginAt mis à jour', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(baseUser);
    prisma.user.update.mockResolvedValue(baseUser);

    const res = await service.loginWithOAuth(googleProfile);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { authProvider_providerId: { authProvider: AuthProvider.GOOGLE, providerId: 'g-123' } },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(res.accessToken).toBe('access-token');
    expect(res.user.id).toBe('u-1');
  });

  it('compte désactivé → 401', async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ ...baseUser, isActive: false });
    await expect(service.loginWithOAuth(googleProfile)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('compte local avec la même adresse vérifiée : liaison (le mot de passe reste valable)', async () => {
    const local = {
      ...baseUser,
      authProvider: AuthProvider.LOCAL,
      providerId: null,
      passwordHash: '$2a$10$hash',
    };
    prisma.user.findUnique
      .mockResolvedValueOnce(null) // pas encore lié
      .mockResolvedValueOnce(local); // trouvé par e-mail
    prisma.user.update.mockImplementation(async ({ data }) => ({ ...local, ...data }));

    await service.loginWithOAuth(googleProfile);

    // Recherche par e-mail normalisé en minuscules
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, { where: { email: 'alice@example.com' } });
    expect(prisma.user.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'u-1' },
      data: { authProvider: AuthProvider.GOOGLE, providerId: 'g-123', avatarUrl: 'https://pic' },
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('adresse déjà liée à un AUTRE fournisseur → 409', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...baseUser, authProvider: AuthProvider.FACEBOOK, providerId: 'fb-1' });

    await expect(service.loginWithOAuth(googleProfile)).rejects.toThrow(
      new ConflictException('Cette adresse e-mail est déjà associée à une connexion Facebook.'),
    );
  });

  it('nouvel utilisateur : compte créé avec le profil du fournisseur', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({ ...baseUser, ...data, id: 'u-new' }));

    const res = await service.loginWithOAuth(googleProfile);

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'alice@example.com',
        displayName: 'Alice G.',
        avatarUrl: 'https://pic',
        authProvider: AuthProvider.GOOGLE,
        providerId: 'g-123',
        lastLoginAt: expect.any(Date),
      },
    });
    expect(res.user.id).toBe('u-new');
    expect(res.refreshToken).toEqual(expect.any(String));
  });

  it('adresse NON vérifiée : jamais utilisée pour lier ni enregistrée', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({ ...baseUser, ...data }));

    await service.loginWithOAuth({ ...googleProfile, emailVerified: false });

    // Une seule recherche (par fournisseur), aucune par e-mail
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.user.create.mock.calls[0][0].data.email).toBeNull();
  });

  it('sans nom ni e-mail (Apple) : nom généré « Joueur-XXXX »', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({ ...baseUser, ...data }));

    await service.loginWithOAuth({
      provider: AuthProvider.APPLE,
      providerId: '001234.abcd5678',
      email: null,
      emailVerified: false,
      displayName: null,
      avatarUrl: null,
    });

    expect(prisma.user.create.mock.calls[0][0].data.displayName).toBe('Joueur-5678');
  });

  it('sans nom : partie locale de l\'adresse vérifiée, tronquée à 32 caractères', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({ ...baseUser, ...data }));
    const longLocal = 'a'.repeat(40);

    await service.loginWithOAuth({
      ...googleProfile,
      email: `${longLocal}@example.com`,
      displayName: null,
    });

    expect(prisma.user.create.mock.calls[0][0].data.displayName).toBe('a'.repeat(32));
  });
});
