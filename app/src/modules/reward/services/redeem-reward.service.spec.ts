import { Test } from '@nestjs/testing';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { RewardInactiveError } from '../errors/reward-inactive.error';
import { RewardNotFoundError } from '../errors/reward-not-found.error';
import {
  REWARD_REDEMPTION_PORT,
  type RewardRedemptionPort,
} from '../interfaces/reward-redemption-port.interface';
import {
  RewardRepository,
  type RewardRecord,
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
    const { service, deps } = await createService();
    const result = await service.redeemReward(command);

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
    const { service, deps } = await createService();
    deps.redemptions.findByIdempotencyKey.mockResolvedValue({
      id: 'existing-redemption',
      status: 'confirmed',
    });

    await expect(service.redeemReward(command)).resolves.toEqual({
      redemptionId: 'existing-redemption',
      status: 'confirmed',
    });
    expect(deps.rewards.findById).not.toHaveBeenCalled();
    expect(deps.redemptions.redeemAtomically).not.toHaveBeenCalled();
  });

  it('throws when the reward does not exist, without calling redeemAtomically', async () => {
    const { service, deps } = await createService();
    deps.rewards.findById.mockResolvedValue(null);

    await expect(service.redeemReward(command)).rejects.toThrow(
      RewardNotFoundError,
    );
    expect(deps.redemptions.redeemAtomically).not.toHaveBeenCalled();
  });

  it('throws when the reward is inactive, without calling redeemAtomically', async () => {
    const { service, deps } = await createService();
    deps.rewards.findById.mockResolvedValue({
      ...activeReward,
      active: false,
    });

    await expect(service.redeemReward(command)).rejects.toThrow(
      RewardInactiveError,
    );
    expect(deps.redemptions.redeemAtomically).not.toHaveBeenCalled();
  });

  it('propagates the domain error redeemAtomically translates from the database', async () => {
    const { service, deps } = await createService();
    deps.redemptions.redeemAtomically.mockRejectedValue(
      new InsufficientBalanceError(),
    );

    await expect(service.redeemReward(command)).rejects.toThrow(
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

async function createService(): Promise<{
  service: RedeemRewardService;
  deps: MockDeps;
}> {
  const deps = createDeps();

  const module = await Test.createTestingModule({
    providers: [
      RedeemRewardService,
      { provide: RewardRepository, useValue: deps.rewards },
      { provide: REWARD_REDEMPTION_PORT, useValue: deps.redemptions },
    ],
  }).compile();

  return { service: module.get(RedeemRewardService), deps };
}
