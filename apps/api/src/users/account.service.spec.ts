import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AccountService } from './account.service';

describe('AccountService — suppression de compte', () => {
  let prisma: any;
  let matchmaking: { dequeue: jest.Mock };
  let service: AccountService;
  const hash = bcrypt.hashSync('secret123', 4);

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), delete: jest.fn().mockReturnValue('delete-op') },
      game: {
        updateMany: jest.fn()
          .mockReturnValueOnce('abort-op')
          .mockReturnValueOnce('detach-white-op')
          .mockReturnValueOnce('detach-black-op'),
      },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    matchmaking = { dequeue: jest.fn().mockResolvedValue(undefined) };
    service = new AccountService(prisma, matchmaking as any);
  });

  it('compte courriel : bon mot de passe + SUPPRIMER → file quittée, parties annulées, compte supprimé', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash });
    await service.deleteAccount('u1', { confirm: 'supprimer', password: 'secret123' });

    expect(matchmaking.dequeue).toHaveBeenCalledWith('u1');
    const abort = prisma.game.updateMany.mock.calls[0][0];
    expect(abort.where.status.in).toEqual(['ONGOING', 'WAITING']);
    expect(abort.where.mode.in).toEqual(['PRIVATE', 'MATCHMAKING']);
    expect(abort.data.status).toBe('ABORTED');
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(prisma.game.updateMany).toHaveBeenNthCalledWith(2, {
      where: { whitePlayerId: 'u1' }, data: { whitePlayerId: null },
    });
    expect(prisma.game.updateMany).toHaveBeenNthCalledWith(3, {
      where: { blackPlayerId: 'u1' }, data: { blackPlayerId: null },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['abort-op', 'detach-white-op', 'detach-black-op', 'delete-op']);
  });

  it('mauvais mot de passe : 401, rien n\'est supprimé', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash });
    await expect(service.deleteAccount('u1', { confirm: 'SUPPRIMER', password: 'faux' })).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.deleteAccount('u1', { confirm: 'SUPPRIMER' })).rejects.toThrow(UnauthorizedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('confirmation absente ou erronée : 400', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', passwordHash: hash });
    await expect(service.deleteAccount('u1', { confirm: 'oui', password: 'secret123' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('compte Google (sans mot de passe) : SUPPRIMER suffit', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', passwordHash: null });
    await service.deleteAccount('u2', { confirm: 'SUPPRIMER' });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u2' } });
  });

  it('Redis indisponible : la suppression a quand même lieu', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', passwordHash: null });
    matchmaking.dequeue.mockRejectedValue(new Error('ECONNREFUSED'));
    await service.deleteAccount('u2', { confirm: 'SUPPRIMER' });
    expect(prisma.user.delete).toHaveBeenCalled();
  });
});
