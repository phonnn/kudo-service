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

  // structurally the send-kudo shape (§6): an invariant-gated debit recorded
  // in the ledger — but single-sided, no receiver, no compensation. The
  // invariant-protected core (balance reserve, stock reserve, redemption +
  // ledger + outbox writes) lives in the redeem_reward() Postgres function
  // (see its migration) so it's one round trip instead of ~8. What's left
  // here are plain reads with no side effects — safe outside a transaction,
  // and only needed for fast, friendly failures before paying for that call.
  // redeemAtomically() re-verifies the reward and re-derives the authoritative
  // status regardless, so a stale read here can't cause an incorrect redeem.
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
