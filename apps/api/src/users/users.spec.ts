// ─────────────────────────────────────────────────────────────────────────────
// Sprint 18 — Tests : avatars, validation du profil, historique, profil public
// ─────────────────────────────────────────────────────────────────────────────
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from '../auth/dto/update-profile.dto';
import { GameStatus } from '../common/prisma-enums';
import { PrismaService } from '../prisma/prisma.service';
import { AVATAR_PRESETS, isValidAvatar } from './avatar-presets';
import { MAX_PAGE_SIZE, toGameSummary, UsersService } from './users.service';

describe('isValidAvatar', () => {
  it('36 préréglages pièce × couleur', () => {
    expect(AVATAR_PRESETS).toHaveLength(36);
    expect(AVATAR_PRESETS).toContain('knight-blue');
  });

  it.each([
    'preset:knight-blue',
    'preset:king-red',
    'https://lh3.googleusercontent.com/a/photo.jpg',
    'https://platform-lookaside.fbsbx.com/x?asid=1',
  ])('accepte %s', (v) => expect(isValidAvatar(v)).toBe(true));

  it.each([
    'preset:dragon-gold',
    'preset:',
    'http://example.com/a.png',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'https://user:pass@example.com/a.png',
    `https://example.com/${'a'.repeat(600)}`,
    42,
  ])('refuse %s', (v) => expect(isValidAvatar(v)).toBe(false));
});

describe('UpdateProfileDto', () => {
  async function errorsFor(body: Record<string, unknown>) {
    const dto = plainToInstance(UpdateProfileDto, body);
    const errors = await validate(dto);
    return { dto, fields: errors.map((e) => e.property) };
  }

  it('profil valide, nom normalisé, pays en majuscules', async () => {
    const { dto, fields } = await errorsFor({
      displayName: '  Magnus   C.  ',
      avatarUrl: 'preset:queen-teal',
      country: 'ca',
    });
    expect(fields).toEqual([]);
    expect(dto.displayName).toBe('Magnus C.');
    expect(dto.country).toBe('CA');
  });

  it('null efface l\'avatar et le pays', async () => {
    expect((await errorsFor({ avatarUrl: null, country: null })).fields).toEqual([]);
  });

  it.each([
    [{ displayName: 'x' }, 'displayName'],
    [{ displayName: 'a'.repeat(33) }, 'displayName'],
    [{ displayName: '   ' }, 'displayName'],
    [{ avatarUrl: 'javascript:alert(1)' }, 'avatarUrl'],
    [{ avatarUrl: 'preset:inconnu' }, 'avatarUrl'],
    [{ country: 'Canada' }, 'country'],
    [{ country: 'ZZ' }, 'country'],
  ])('refuse %o', async (body, field) => {
    expect((await errorsFor(body)).fields).toContain(field);
  });
});

describe('toGameSummary', () => {
  const base = {
    id: 'g-1',
    mode: 'MATCHMAKING',
    timeControl: 'BLITZ',
    status: 'FINISHED',
    resultReason: 'CHECKMATE',
    aiLevel: null,
    whitePlayerId: 'alice',
    blackPlayerId: 'bob',
    whitePlayer: { id: 'alice', displayName: 'Alice', avatarUrl: null },
    blackPlayer: { id: 'bob', displayName: 'Bob', avatarUrl: 'preset:rook-green' },
    createdAt: new Date('2026-11-01'),
    endedAt: new Date('2026-11-01'),
    _count: { moves: 42 },
  };

  it('point de vue de chaque joueur : couleur, issue, adversaire', () => {
    const forAlice = toGameSummary({ ...base, result: 'WHITE_WIN' }, 'alice');
    expect(forAlice).toMatchObject({
      color: 'white',
      outcome: 'win',
      opponent: { type: 'user', id: 'bob', displayName: 'Bob', avatarUrl: 'preset:rook-green' },
      moveCount: 42,
    });
    const forBob = toGameSummary({ ...base, result: 'WHITE_WIN' }, 'bob');
    expect(forBob).toMatchObject({ color: 'black', outcome: 'loss', opponent: { id: 'alice' } });
  });

  it('partie locale : pas d\'issue « victoire / défaite », pas d\'adversaire', () => {
    const local = toGameSummary(
      { ...base, mode: 'LOCAL', result: 'BLACK_WIN', blackPlayerId: null, blackPlayer: null },
      'alice',
    );
    expect(local).toMatchObject({ mode: 'LOCAL', result: 'BLACK_WIN', outcome: null, opponent: null });
  });

  it('nulle, partie en cours, adversaire IA', () => {
    expect(toGameSummary({ ...base, result: 'DRAW' }, 'bob').outcome).toBe('draw');
    expect(toGameSummary({ ...base, result: null, status: 'ONGOING' }, 'bob').outcome).toBeNull();
    const ai = toGameSummary(
      { ...base, mode: 'AI', aiLevel: 4, result: null, blackPlayerId: null, blackPlayer: null },
      'alice',
    );
    expect(ai.opponent).toEqual({ type: 'ai', level: 4 });
  });
});

describe('UsersService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    game: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const service = new UsersService(prisma as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.game.findMany.mockResolvedValue([]);
    prisma.game.count.mockResolvedValue(0);
  });

  it('profil public : ni e-mail ni fournisseur de connexion', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u-1', email: 'secret@example.com', authProvider: 'GOOGLE', displayName: 'Alice',
      avatarUrl: null, country: 'CA', role: 'PLAYER', createdAt: new Date(),
    });
    const profile = await service.findById('u-1');
    expect(profile).not.toHaveProperty('email');
    expect(profile).not.toHaveProperty('authProvider');
    expect(profile).toMatchObject({ id: 'u-1', displayName: 'Alice', country: 'CA' });
  });

  it('historique : filtre de statut et taille de page plafonnée', async () => {
    await service.getGames('alice', { page: 2, pageSize: 10_000, status: GameStatus.ONGOING });

    const args = prisma.game.findMany.mock.calls[0][0];
    expect(args.take).toBe(MAX_PAGE_SIZE);
    expect(args.skip).toBe(MAX_PAGE_SIZE);
    expect(args.where).toEqual({
      OR: [{ whitePlayerId: 'alice' }, { blackPlayerId: 'alice' }],
      status: GameStatus.ONGOING,
    });
    // Les adversaires sont chargés sans leurs données privées
    expect(args.include.whitePlayer).toEqual({ select: { id: true, displayName: true, avatarUrl: true } });
  });

  it('valeurs de pagination absurdes → bornées', async () => {
    await service.getGames('alice', { page: -5, pageSize: 0 });
    const args = prisma.game.findMany.mock.calls[0][0];
    expect(args).toMatchObject({ skip: 0, take: 1 });
    expect(args.where).not.toHaveProperty('status');
  });
});
