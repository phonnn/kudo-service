import { Test } from '@nestjs/testing';
import { InvalidCursorError } from '../errors/invalid-cursor.error';
import { RedemptionRepository } from '../repositories/redemption.repository';
import { RedemptionHistoryService } from './redemption-history.service';

describe('RedemptionHistoryService', () => {
  describe('listHistory', () => {
    it('passes the user id, limit, and null cursor through to the repository', async () => {
      const { service, deps } = await createService();
      await service.listHistory('user-1', 10, undefined);

      expect(deps.redemptions.listForUser).toHaveBeenCalledWith(
        'user-1',
        10,
        null,
      );
    });

    it('caps the limit at MAX_LIMIT and omits a cursor short of a full page', async () => {
      const { service, deps } = await createService();
      deps.redemptions.listForUser.mockResolvedValue([
        {
          id: 'redemption-1',
          rewardId: 'reward-1',
          rewardName: 'Coffee',
          costPoints: 30,
          status: 'confirmed',
          createdAt: new Date(),
        },
      ]);

      const page = await service.listHistory('user-1', 999, undefined);

      expect(deps.redemptions.listForUser).toHaveBeenCalledWith(
        'user-1',
        50,
        null,
      );
      expect(page.nextCursor).toBeNull();
    });

    it('returns a cursor when the page is full', async () => {
      const { service, deps } = await createService();
      deps.redemptions.listForUser.mockResolvedValue([
        {
          id: 'redemption-1',
          rewardId: 'reward-1',
          rewardName: 'Coffee',
          costPoints: 30,
          status: 'confirmed',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      const page = await service.listHistory('user-1', 1, undefined);
      expect(page.nextCursor).not.toBeNull();
    });

    it('round-trips a cursor produced by a prior page through decode -> repository call', async () => {
      const { service, deps } = await createService();
      const createdAt = new Date('2026-01-01T00:00:00.000Z');
      const cursor = Buffer.from(
        JSON.stringify({
          createdAt: createdAt.toISOString(),
          id: 'redemption-1',
        }),
      ).toString('base64url');

      await service.listHistory('user-1', 20, cursor);

      expect(deps.redemptions.listForUser).toHaveBeenCalledWith('user-1', 20, {
        createdAt,
        id: 'redemption-1',
      });
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
  redemptions: jest.Mocked<Pick<RedemptionRepository, 'listForUser'>>;
}

function createDeps(): MockDeps {
  return {
    redemptions: { listForUser: jest.fn().mockResolvedValue([]) },
  };
}

async function createService(): Promise<{
  service: RedemptionHistoryService;
  deps: MockDeps;
}> {
  const deps = createDeps();

  const module = await Test.createTestingModule({
    providers: [
      RedemptionHistoryService,
      { provide: RedemptionRepository, useValue: deps.redemptions },
    ],
  }).compile();

  return { service: module.get(RedemptionHistoryService), deps };
}
