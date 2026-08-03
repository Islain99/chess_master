import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GameMode,
  GameStatus,
  PlayerType,
  TimeControlCategory,
} from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';

const TIME_MS: Record<TimeControlCategory, number> = {
  BULLET:    60_000,
  BLITZ:    300_000,
  RAPID:    600_000,
  CLASSICAL: 1_800_000,
};

@Injectable()
export class RoomsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Crée une salle privée et retourne le code d'invitation + l'identifiant de partie.
   * La partie est en état WAITING jusqu'à ce qu'un adversaire rejoigne.
   */
  async create(
    timeControl: TimeControlCategory,
    userId?: string,
  ): Promise<{ roomCode: string; gameId: string }> {
    const initialMs = TIME_MS[timeControl];
    const roomCode  = this.generateCode();

    const game = await this.prisma.game.create({
      data: {
        mode:             GameMode.PRIVATE,
        timeControl,
        initialTimeSeconds: initialMs / 1000,
        incrementSeconds: 0,
        whitePlayerId:    userId ?? null,
        whitePlayerType:  PlayerType.HUMAN,
        blackPlayerType:  PlayerType.HUMAN,
        status:           GameStatus.WAITING,
        whiteTimeRemainingMs: initialMs,
        blackTimeRemainingMs: initialMs,
        initialFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        currentFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        roomCode,
      },
    });

    return { roomCode, gameId: game.id };
  }

  /**
   * Rejoint une salle par son code.
   * Passe la partie en ONGOING et assigne le deuxième joueur.
   */
  async join(code: string, userId?: string) {
    const game = await this.prisma.game.findUnique({
      where: { roomCode: code.toUpperCase() },
    });

    if (!game) {
      throw new NotFoundException(`Code de salle « ${code} » introuvable.`);
    }
    if (game.status !== GameStatus.WAITING) {
      throw new ConflictException('Cette salle est déjà complète ou terminée.');
    }
    if (userId && userId === game.whitePlayerId) {
      throw new ConflictException('Vous ne pouvez pas rejoindre votre propre salle.');
    }

    return this.prisma.game.update({
      where: { id: game.id },
      data: {
        blackPlayerId: userId ?? null,
        status:        GameStatus.ONGOING,
        startedAt:     new Date(),
      },
    });
  }

  /** Retourne les informations d'une salle à partir de son code. */
  async findByCode(code: string) {
    const game = await this.prisma.game.findUnique({
      where: { roomCode: code.toUpperCase() },
    });
    if (!game) throw new NotFoundException(`Code « ${code} » introuvable.`);
    return game;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /** Génère un code alphanumérique majuscules de 6 caractères. */
  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I (ambigus)
    return Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)],
    ).join('');
  }
}
