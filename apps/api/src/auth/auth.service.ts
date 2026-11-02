import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthProvider, UserRole } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OAuthProfile, PROVIDER_LABEL } from './oauth/oauth.types';

/**
 * Durée de vie des tokens.
 * Access token : 15 minutes (transmis à chaque requête, vie courte pour limiter la fenêtre de compromission).
 * Refresh token : 7 jours (stocké côté client, utilisé uniquement pour renouveler les access tokens).
 */
const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_DAYS = 7;
const BCRYPT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // ──────────────────────────────────────────────
  // Inscription
  // ──────────────────────────────────────────────

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Cette adresse e-mail est déjà utilisée.');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        displayName: dto.displayName,
        authProvider: AuthProvider.LOCAL,
      },
    });

    return this.issueTokens(user);
  }

  // ──────────────────────────────────────────────
  // Connexion
  // ──────────────────────────────────────────────

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    // Mettre à jour la date de dernière connexion
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.issueTokens(user);
  }

  // ──────────────────────────────────────────────
  // Connexion OAuth2 (Google, Apple, Facebook) — sprint 15
  // ──────────────────────────────────────────────

  /**
   * Retrouve ou crée le compte correspondant à une identité déjà vérifiée par
   * OAuthVerifierService, puis émet nos jetons.
   *
   * Ordre de résolution :
   *   1. compte déjà lié à (fournisseur, identifiant fournisseur) ;
   *   2. compte existant avec la même adresse e-mail, UNIQUEMENT si le
   *      fournisseur garantit l'adresse (email_verified) → liaison du compte.
   *      Le mot de passe éventuel reste valable : l'utilisateur garde les deux
   *      moyens de connexion ;
   *   3. création d'un nouveau compte.
   *
   * Une adresse non vérifiée n'est jamais enregistrée : sinon quelqu'un
   * pourrait réserver l'e-mail d'autrui puis capter son futur compte.
   */
  async loginWithOAuth(profile: OAuthProfile) {
    const linked = await this.prisma.user.findUnique({
      where: {
        authProvider_providerId: {
          authProvider: profile.provider,
          providerId: profile.providerId,
        },
      },
    });
    if (linked) return this.completeOAuthLogin(linked);

    const trustedEmail = profile.emailVerified ? profile.email?.toLowerCase() ?? null : null;

    if (trustedEmail) {
      const byEmail = await this.prisma.user.findUnique({ where: { email: trustedEmail } });
      if (byEmail) {
        if (byEmail.providerId && byEmail.authProvider !== AuthProvider.LOCAL) {
          // Un compte = un fournisseur externe (contrainte du modèle User).
          throw new ConflictException(
            `Cette adresse e-mail est déjà associée à une connexion ${PROVIDER_LABEL[byEmail.authProvider] ?? byEmail.authProvider}.`,
          );
        }
        const updated = await this.prisma.user.update({
          where: { id: byEmail.id },
          data: {
            authProvider: profile.provider,
            providerId: profile.providerId,
            avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          },
        });
        return this.completeOAuthLogin(updated);
      }
    }

    const created = await this.prisma.user.create({
      data: {
        email: trustedEmail,
        displayName: oauthDisplayName(profile),
        avatarUrl: profile.avatarUrl,
        authProvider: profile.provider,
        providerId: profile.providerId,
        lastLoginAt: new Date(),
      },
    });
    return this.issueTokens(created);
  }

  private async completeOAuthLogin(user: { id: string; isActive: boolean } & Parameters<AuthService['issueTokens']>[0]) {
    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte est désactivé.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return this.issueTokens(user);
  }

  // ──────────────────────────────────────────────
  // Renouvellement des tokens (rotation)
  // ──────────────────────────────────────────────

  async refresh(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token invalide.');
    }
    if (storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      // Token révoqué ou expiré → invalider toute la famille (détection de réutilisation)
      await this.prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      throw new UnauthorizedException('Refresh token révoqué ou expiré.');
    }

    // Révoquer l'ancien token avant d'en émettre un nouveau (rotation)
    await this.prisma.refreshToken.delete({ where: { tokenHash } });

    return this.issueTokens(storedToken.user);
  }

  // ──────────────────────────────────────────────
  // Déconnexion
  // ──────────────────────────────────────────────

  async logout(userId: string, rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.deleteMany({
      where: { userId, tokenHash },
    });
  }

  // ──────────────────────────────────────────────
  // Profil (utilisé par UsersController)
  // ──────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    return this.toPublicUser(user);
  }

  async updateProfile(
    userId: string,
    data: { displayName?: string; avatarUrl?: string; country?: string },
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.displayName && { displayName: data.displayName }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
        ...(data.country !== undefined && { country: data.country }),
      },
    });
    return this.toPublicUser(user);
  }

  // ──────────────────────────────────────────────
  // Helpers privés
  // ──────────────────────────────────────────────

  private async issueTokens(user: { id: string; email: string | null; displayName: string; role: UserRole }) {
    const payload = { sub: user.id, email: user.email };

    // Access token JWT
    const accessToken = this.jwt.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });

    // Refresh token : UUID aléatoire + hash SHA-256 pour stockage DB
    const rawRefreshToken = randomUUID();
    const tokenHash = this.hashToken(rawRefreshToken);
    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1_000,
    );

    await this.prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 15 * 60, // secondes
      user: this.toPublicUser(user as any),
    };
  }

  /**
   * Hash déterministe pour la recherche en BDD.
   * On utilise SHA-256 (rapide, pas de sel) car le token UUID est déjà
   * cryptographiquement aléatoire et de taille suffisante.
   */
  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toPublicUser(user: any) {
    return {
      id:          user.id,
      email:       user.email,
      displayName: user.displayName,
      avatarUrl:   user.avatarUrl ?? null,
      country:     user.country ?? null,
      role:        user.role,
      authProvider: user.authProvider,
      createdAt:   user.createdAt,
    };
  }
}

/**
 * Nom d'affichage d'un compte créé par OAuth : celui du fournisseur, sinon la
 * partie locale de l'e-mail, sinon « Joueur-XXXX ». Ramené à 2–32 caractères
 * (mêmes bornes que RegisterDto).
 */
function oauthDisplayName(profile: OAuthProfile): string {
  const candidate =
    profile.displayName?.trim() ||
    (profile.emailVerified ? profile.email?.split('@')[0] : undefined) ||
    `Joueur-${profile.providerId.slice(-4)}`;
  const name = candidate.replace(/\s+/g, ' ').slice(0, 32).trim();
  return name.length >= 2 ? name : `Joueur-${profile.providerId.slice(-4)}`;
}
