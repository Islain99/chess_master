import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthProvider, UserRole } from '../common/prisma-enums';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const mockUser = {
  id: 'user-uuid-1',
  email: 'alice@example.com',
  passwordHash: '$2a$10$mocked.hash', // sera surchargé par bcrypt.compare mock
  displayName: 'Alice',
  avatarUrl: null,
  country: null,
  role: UserRole.PLAYER,
  authProvider: AuthProvider.LOCAL,
  createdAt: new Date(),
  updatedAt: new Date(),
  isActive: true,
  lastLoginAt: null,
  providerId: null,
};

const mockRefreshToken = {
  id: 'rt-uuid-1',
  userId: 'user-uuid-1',
  tokenHash: 'sha256-hash-of-token',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000),
  revokedAt: null,
  userAgent: null,
  ipAddress: null,
  createdAt: new Date(),
  user: mockUser,
};

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create:     jest.fn(),
    update:     jest.fn(),
  },
  refreshToken: {
    findUnique:  jest.fn(),
    create:      jest.fn(),
    delete:      jest.fn(),
    deleteMany:  jest.fn().mockResolvedValue({ count: 0 }),
    updateMany:  jest.fn(),
  },
};

// ─── Mock JwtService ──────────────────────────────────────────────────────────

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock-access-token'),
};

// ─── Mock bcryptjs ────────────────────────────────────────────────────────────

jest.mock('bcryptjs', () => ({
  hash:     jest.fn().mockResolvedValue('hashed-password'),
  hashSync: jest.fn().mockReturnValue('dummy-hash'),
  compare:  jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService,   useValue: mockJwt },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
  });

  // ─── register ───────────────────────────────────────────────────────────────

  describe('register()', () => {
    it('crée un compte et retourne access + refresh tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      const result = await service.register({
        email: 'alice@example.com',
        password: 'SecureP@ss1',
        displayName: 'Alice',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(typeof result.refreshToken).toBe('string');
      expect(result.user.email).toBe('alice@example.com');
      expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    });

    it('lève ConflictException si l\'email est déjà utilisé', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.register({ email: 'alice@example.com', password: 'x', displayName: 'A' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('retourne des tokens pour des identifiants valides', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.user.update.mockResolvedValue(mockUser);
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'alice@example.com',
        password: 'SecureP@ss1',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.email).toBe('alice@example.com');
    });

    it('lève UnauthorizedException si l\'utilisateur n\'existe pas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lève UnauthorizedException si le mot de passe est incorrect', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'alice@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('compte inconnu : bcrypt est tout de même appelé (pas d\'indice par la durée)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' }),
      ).rejects.toThrow('Identifiants invalides.');
      expect(bcrypt.compare).toHaveBeenCalledWith('x', 'dummy-hash');
    });

    it('compte désactivé : connexion par mot de passe refusée', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, isActive: false });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({ email: 'alice@example.com', password: 'SecureP@ss1' }),
      ).rejects.toThrow(/désactivé/);
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  // ─── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh()', () => {
    it('rotation : marque l\'ancien jeton révoqué (sans le supprimer) et en émet un nouveau', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.create.mockResolvedValue(mockRefreshToken);

      const result = await service.refresh('some-valid-uuid');

      expect(result.accessToken).toBe('mock-access-token');
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: expect.any(String), revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockPrisma.refreshToken.delete).not.toHaveBeenCalled();
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('lève UnauthorizedException si le token est inconnu', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('réutilisation d\'un jeton déjà échangé : toutes les sessions sont fermées', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        revokedAt: new Date(),
      });
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 3 });

      await expect(service.refresh('revoked-token')).rejects.toThrow(/déjà utilisé/);
      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1' },
      });
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('échange concurrent : la requête perdante est refusée', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refresh('raced-token')).rejects.toThrow(UnauthorizedException);
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('jeton expiré : supprimé, sans fermer les autres sessions', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.refresh('expired-token')).rejects.toThrow(/expiré/);
      expect(mockPrisma.refreshToken.delete).toHaveBeenCalledTimes(1);
      expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it('compte désactivé : pas de nouveau jeton', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        user: { ...mockUser, isActive: false },
      });

      await expect(service.refresh('valid-token')).rejects.toThrow(/désactivé/);
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('chaque émission purge les jetons expirés de l\'utilisateur', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(mockRefreshToken);
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.refresh('some-valid-uuid');

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-uuid-1', expiresAt: { lt: expect.any(Date) } },
      });
    });
  });

  // ─── logout ──────────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('supprime le refresh token de la BDD', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout('user-uuid-1', 'some-refresh-token');

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getProfile ──────────────────────────────────────────────────────────────

  describe('getProfile()', () => {
    it('retourne les données publiques de l\'utilisateur', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const profile = await service.getProfile('user-uuid-1');

      expect(profile.id).toBe('user-uuid-1');
      expect((profile as any).passwordHash).toBeUndefined();
    });

    it('lève NotFoundException si l\'utilisateur est inconnu', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('unknown')).rejects.toThrow(NotFoundException);
    });
  });
});
