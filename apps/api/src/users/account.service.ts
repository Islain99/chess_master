import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { GameMode, GameStatus } from '../common/prisma-enums';
import { MatchmakingService } from '../matchmaking/matchmaking.service';
import { PrismaService } from '../prisma/prisma.service';

/** Mot à taper pour confirmer (évite une suppression par erreur). */
export const DELETE_CONFIRMATION = 'SUPPRIMER';

export class DeleteAccountDto {
  @IsString()
  confirm!: string;

  /** Obligatoire pour un compte courriel / mot de passe. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  password?: string;
}

/**
 * Novembre 2026 — Suppression de compte (RGPD art. 17, Loi 25 du Québec).
 *
 * Effacé (suppression en cascade dans le schéma) : profil, courriel, mot de
 * passe, sessions, appareils push, notifications, classements, statistiques,
 * file de matchmaking, signalements.
 * Conservé : les parties terminées, sans lien avec le compte (joueur = NULL),
 * pour que l'historique des adversaires reste intact ; elles s'affichent
 * « Compte supprimé ». Une partie ne contient aucune donnée personnelle.
 * Parties en ligne en cours ou en attente : ANNULÉES, sans effet sur l'Elo
 * de l'adversaire (un forfait déclencherait un calcul d'Elo concurrent de la
 * suppression).
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matchmaking: MatchmakingService,
  ) {}

  async deleteAccount(userId: string, dto: DeleteAccountDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Compte introuvable.');

    if (dto.confirm?.trim().toUpperCase() !== DELETE_CONFIRMATION) {
      throw new BadRequestException(`Tapez ${DELETE_CONFIRMATION} pour confirmer la suppression.`);
    }
    if (user.passwordHash) {
      const ok = !!dto.password && (await bcrypt.compare(dto.password, user.passwordHash));
      if (!ok) throw new UnauthorizedException('Mot de passe incorrect.');
    }

    // 1. Quitter la file de matchmaking (Redis), si le joueur y était.
    await this.matchmaking
      .dequeue(userId)
      .catch((err) => this.logger.warn(`Sortie de file échouée pour ${userId} : ${err}`));

    // 2. Annuler ses parties en ligne non terminées, 3. détacher toutes ses
    //    parties, 4. supprimer le compte — en une seule transaction.
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.game.updateMany({
        where: {
          OR: [{ whitePlayerId: userId }, { blackPlayerId: userId }],
          mode: { in: [GameMode.PRIVATE, GameMode.MATCHMAKING] },
          status: { in: [GameStatus.ONGOING, GameStatus.WAITING] },
        },
        data: { status: GameStatus.ABORTED, endedAt: now },
      }),
      // Détacher explicitement les parties (historique des adversaires) au
      // lieu de dépendre de l'action ON DELETE de la clé étrangère.
      this.prisma.game.updateMany({ where: { whitePlayerId: userId }, data: { whitePlayerId: null } }),
      this.prisma.game.updateMany({ where: { blackPlayerId: userId }, data: { blackPlayerId: null } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    this.logger.log(`Compte ${userId} supprimé à sa demande.`);
  }
}
