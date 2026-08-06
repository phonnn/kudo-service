import type { UnitOfWork } from '@kudo/database';
import type { OutboxRepository } from '../../outbox';
import type { PointLedgerRepository } from '../../point/repositories/point-ledger.repository';
import type { ReceiverBalanceRepository } from '../../point/repositories/receiver-balance.repository';
import type { ReceiverBalanceService } from '../../point/services/receiver-balance.service';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { RewardInactiveError } from '../errors/reward-inactive.error';
import { RewardNotFoundError } from '../errors/reward-not-found.error';
import { RewardOutOfStockError } from '../errors/reward-out-of-stock.error';
import type { RedemptionRepository } from '../repositories/redemption.repository';
import type {
  RewardRecord,
  RewardRepository,
} from '../repositories/reward.repository';
import { RedeemRewardService } from './redeem-reward.service';

describe('RedeemRewardService', () => {
  const command = {
    userId: 'user-1',
    rewardId: 'reward-1',
    idempotencyKey: 'request-1',
  };

  const unlimitedReward: RewardRecord = {
    id: 'reward-1',
    costPoints: 30,
    stock: null,
    active: true,
  };

  it('redeems and writes every table through its repository', async () => {
    const deps = createDeps();
    const result = await createService(deps).redeemReward(command);

    expect(deps.redemptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        rewardId: 'reward-1',
        costPoints: 30,
        idempotencyKey: 'request-1',
      }),
    );
    expect(deps.pointLedger.appendRedeemDebit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', points: 30 }),
    );
    expect(deps.receiverBalance.applyDelta).toHaveBeenCalledWith(
      'user-1',
      -30,
      500,
    );
    expect(deps.outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'reward.redeemed' }),
    );
    expect(result.status).toBe('confirmed');
  });

  it('returns the existing redemption for an idempotent retry', async () => {
    const deps = createDeps();
    deps.redemptions.findByIdempotencyKey.mockResolvedValue({
      id: 'existing-redemption',
      status: 'confirmed',
    });

    await expect(createService(deps).redeemReward(command)).resolves.toEqual({
      redemptionId: 'existing-redemption',
      status: 'confirmed',
    });
    expect(deps.rewards.findById).not.toHaveBeenCalled();
  });

  it('throws when the reward does not exist', async () => {
    const deps = createDeps();
    deps.rewards.findById.mockResolvedValue(null);

    await expect(createService(deps).redeemReward(command)).rejects.toThrow(
      RewardNotFoundError,
    );
    expect(deps.redemptions.create).not.toHaveBeenCalled();
  });

  it('throws when the reward is inactive', async () => {
    const deps = createDeps();
    deps.rewards.findById.mockResolvedValue({
      ...unlimitedReward,
      active: false,
    });

    await expect(createService(deps).redeemReward(command)).rejects.toThrow(
      RewardInactiveError,
    );
    expect(deps.redemptions.create).not.toHaveBeenCalled();
  });

  it('throws insufficient balance before writing anything', async () => {
    const deps = createDeps();
    deps.receiverBalanceService.syncFromLedger.mockResolvedValue(10);

    await expect(createService(deps).redeemReward(command)).rejects.toThrow(
      InsufficientBalanceError,
    );
    expect(deps.redemptions.create).not.toHaveBeenCalled();
  });

  it('reserves stock only for finite-stock rewards', async () => {
    const deps = createDeps();
    await createService(deps).redeemReward(command);
    expect(deps.rewards.reserveStock).not.toHaveBeenCalled();

    deps.rewards.findById.mockResolvedValue({
      ...unlimitedReward,
      stock: 5,
    });
    await createService(deps).redeemReward({
      ...command,
      idempotencyKey: 'request-2',
    });
    expect(deps.rewards.reserveStock).toHaveBeenCalledWith('reward-1');
  });

  it('throws when finite stock is exhausted', async () => {
    const deps = createDeps();
    deps.rewards.findById.mockResolvedValue({ ...unlimitedReward, stock: 5 });
    deps.rewards.reserveStock.mockResolvedValue(false);

    await expect(createService(deps).redeemReward(command)).rejects.toThrow(
      RewardOutOfStockError,
    );
    expect(deps.redemptions.create).not.toHaveBeenCalled();
  });

  it('runs everything inside a single unit of work', async () => {
    const deps = createDeps();
    const uow = { run: jest.fn((work: () => Promise<unknown>) => work()) };
    await createService(deps, uow as unknown as UnitOfWork).redeemReward(
      command,
    );
    expect(uow.run).toHaveBeenCalledTimes(1);
  });
});

interface MockDeps {
  rewards: jest.Mocked<Pick<RewardRepository, 'findById' | 'reserveStock'>>;
  redemptions: jest.Mocked<
    Pick<RedemptionRepository, 'findByIdempotencyKey' | 'create'>
  >;
  pointLedger: jest.Mocked<Pick<PointLedgerRepository, 'appendRedeemDebit'>>;
  receiverBalance: jest.Mocked<Pick<ReceiverBalanceRepository, 'applyDelta'>>;
  receiverBalanceService: jest.Mocked<
    Pick<ReceiverBalanceService, 'syncFromLedger'>
  >;
  outbox: jest.Mocked<Pick<OutboxRepository, 'enqueue'>>;
}

function createDeps(): MockDeps {
  return {
    rewards: {
      findById: jest.fn().mockResolvedValue({
        id: 'reward-1',
        costPoints: 30,
        stock: null,
        active: true,
      }),
      reserveStock: jest.fn().mockResolvedValue(true),
    },
    redemptions: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    pointLedger: { appendRedeemDebit: jest.fn().mockResolvedValue(500) },
    receiverBalance: { applyDelta: jest.fn().mockResolvedValue(70) },
    receiverBalanceService: {
      syncFromLedger: jest.fn().mockResolvedValue(100),
    },
    outbox: { enqueue: jest.fn() },
  };
}

function createService(
  deps: MockDeps,
  uow: UnitOfWork = {
    run: (work: () => Promise<unknown>) => work(),
  } as unknown as UnitOfWork,
): RedeemRewardService {
  return new RedeemRewardService(
    uow,
    deps.rewards as unknown as RewardRepository,
    deps.redemptions as unknown as RedemptionRepository,
    deps.pointLedger as unknown as PointLedgerRepository,
    deps.receiverBalance as unknown as ReceiverBalanceRepository,
    deps.receiverBalanceService as unknown as ReceiverBalanceService,
    deps.outbox as unknown as OutboxRepository,
  );
}
