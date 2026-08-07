import { Test } from '@nestjs/testing';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { PointLedgerRepository } from '../repositories/point-ledger.repository';
import { PointLedgerService } from './point-ledger.service';

describe('PointLedgerService', () => {
  describe('listHistory', () => {
    it('passes the user id, limit, and null cursor through to the repository', async () => {
      const { service, deps } = await createService();
      await service.listHistory('user-1', 10, undefined);

      expect(deps.ledger.listForUser).toHaveBeenCalledWith('user-1', 10, null);
    });

    it('caps the limit at MAX_LIMIT and omits a cursor short of a full page', async () => {
      const { service, deps } = await createService();
      deps.ledger.listForUser.mockResolvedValue([
        {
          id: 5,
          delta: -10,
          ledgerType: 'giving_spend',
          refType: 'kudo',
          refId: 'transfer-1',
          createdAt: new Date(),
        },
      ]);

      const page = await service.listHistory('user-1', 999, undefined);

      expect(deps.ledger.listForUser).toHaveBeenCalledWith('user-1', 50, null);
      expect(page.nextCursor).toBeNull();
    });

    it('returns a cursor when the page is full', async () => {
      const { service, deps } = await createService();
      deps.ledger.listForUser.mockResolvedValue([
        {
          id: 5,
          delta: 10,
          ledgerType: 'earn',
          refType: 'kudo',
          refId: 'transfer-1',
          createdAt: new Date(),
        },
      ]);

      const page = await service.listHistory('user-1', 1, undefined);
      expect(page.nextCursor).not.toBeNull();
    });

    it('round-trips a cursor produced by a prior page through decode -> repository call', async () => {
      const { service, deps } = await createService();
      const cursor = Buffer.from(JSON.stringify({ id: 5 })).toString(
        'base64url',
      );

      await service.listHistory('user-1', 20, cursor);

      expect(deps.ledger.listForUser).toHaveBeenCalledWith('user-1', 20, 5);
    });

    it('throws InvalidCursorError on a malformed cursor', async () => {
      const { service } = await createService();
      await expect(
        service.listHistory('user-1', 20, 'not-a-valid-cursor'),
      ).rejects.toThrow(InvalidCursorError);
    });
  });
});

interface MockDeps {
  ledger: jest.Mocked<Pick<PointLedgerRepository, 'listForUser'>>;
}

function createDeps(): MockDeps {
  return { ledger: { listForUser: jest.fn().mockResolvedValue([]) } };
}

async function createService(): Promise<{
  service: PointLedgerService;
  deps: MockDeps;
}> {
  const deps = createDeps();

  const module = await Test.createTestingModule({
    providers: [
      PointLedgerService,
      { provide: PointLedgerRepository, useValue: deps.ledger },
    ],
  }).compile();

  return { service: module.get(PointLedgerService), deps };
}
