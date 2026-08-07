import { Inject, Injectable } from '@nestjs/common';
import { RewardInactiveError } from '../errors/reward-inactive.error';
import { RewardNotFoundError } from '../errors/reward-not-found.error';
import type { RedeemedReward } from '../interfaces/redeemed-reward.interface';
import {
  REWARD_REDEMPTION_PORT,
  type RewardRedemptionPort,
} from '../interfaces/reward-redemption-port.interface';
import { RewardRepository } from '../repositories/reward.repository';

export interface RedeemRewardCommand {
  userId: string;
  rewardId: string;
  idempotencyKey: string;
}

@Injectable()
export class RedeemRewardService {
  constructor(
    private readonly rewards: RewardRepository,
    @Inject(REWARD_REDEMPTION_PORT)
    private readonly redemptions: RewardRedemptionPort,
  ) {}

  // These are plain reads with no side effects, done only for fast, friendly
  // failures before paying for redeemAtomically()'s round trip.
  // redeemAtomically() re-verifies the reward and re-derives the
  // authoritative status regardless, so a stale read here can't cause an
  // incorrect redeem.
  async redeemReward(command: RedeemRewardCommand): Promise<RedeemedReward> {
    const existing = await this.redemptions.findByIdempotencyKey(
      command.idempotencyKey,
    );
    if (existing) {
      return { redemptionId: existing.id, status: existing.status };
    }

    const reward = await this.rewards.findById(command.rewardId);
    if (!reward) {
      throw new RewardNotFoundError();
    }
    if (!reward.active) {
      throw new RewardInactiveError();
    }

    const redemption = await this.redemptions.redeemAtomically({
      userId: command.userId,
      rewardId: command.rewardId,
      idempotencyKey: command.idempotencyKey,
    });

    return { redemptionId: redemption.id, status: redemption.status };
  }
}
