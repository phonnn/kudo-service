import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { RewardInactiveError } from '../errors/reward-inactive.error';
import { RewardNotFoundError } from '../errors/reward-not-found.error';
import type { RewardRedemptionPort } from '../interfaces/reward-redemption-port.interface';
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

  const activeReward: RewardRecord = {
    id: 'reward-1',
    costPoints: 30,
    stock: null,
    active: true,
  };

  it('delegates to the atomic redeem after the fast pre-checks pass', async () => {
    const deps = createDeps();
    const result = await createService(deps).redeemReward(command);

    expect(deps.redemptions.redeemAtomically).toHaveBeenCalledWith({
      userId: 'user-1',
      rewardId: 'reward-1',
      idempotencyKey: 'request-1',
    });
    expect(result).toEqual({
      redemptionId: 'redemption-1',
      status: 'confirmed',
    });
  });

  it('returns the existing redemption for an idempotent retry without touching the reward', async () => {
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
    expect(deps.redemptions.redeemAtomically).not.toHaveBeenCalled();
  });

  it('throws when the reward does not exist, without calling redeemAtomically', async () => {
    const deps = createDeps();
    deps.rewards.findById.mockResolvedValue(null);

    await expect(createService(deps).redeemReward(command)).rejects.toThrow(
      RewardNotFoundError,
    );
    expect(deps.redemptions.redeemAtomically).not.toHaveBeenCalled();
  });

  it('throws when the reward is inactive, without calling redeemAtomically', async () => {
    const deps = createDeps();
    deps.rewards.findById.mockResolvedValue({
      ...activeReward,
      active: false,
    });

    await expect(createService(deps).redeemReward(command)).rejects.toThrow(
      RewardInactiveError,
    );
    expect(deps.redemptions.redeemAtomically).not.toHaveBeenCalled();
  });

  // Balance/stock/provisioning checks are enforced inside redeem_reward()
  // itself — the service just propagates the resulting domain error.
  it('propagates the domain error redeemAtomically translates from the database', async () => {
    const deps = createDeps();
    deps.redemptions.redeemAtomically.mockRejectedValue(
      new InsufficientBalanceError(),
    );

    await expect(createService(deps).redeemReward(command)).rejects.toThrow(
      InsufficientBalanceError,
    );
  });
});

interface MockDeps {
  rewards: jest.Mocked<Pick<RewardRepository, 'findById'>>;
  redemptions: jest.Mocked<RewardRedemptionPort>;
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
    },
    redemptions: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      redeemAtomically: jest
        .fn()
        .mockResolvedValue({ id: 'redemption-1', status: 'confirmed' }),
    },
  };
}

function createService(deps: MockDeps): RedeemRewardService {
  return new RedeemRewardService(
    deps.rewards as unknown as RewardRepository,
    deps.redemptions,
  );
}
