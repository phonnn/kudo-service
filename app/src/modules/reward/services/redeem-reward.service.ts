import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { randomUUID } from 'node:crypto';
import { PointLedgerRepository } from '../../point/repositories/point-ledger.repository';
import { ReceiverBalanceRepository } from '../../point/repositories/receiver-balance.repository';
import { ReceiverBalanceService } from '../../point/services/receiver-balance.service';
import { OutboxRepository } from '../../outbox';
import { InsufficientBalanceError } from '../errors/insufficient-balance.error';
import { RewardInactiveError } from '../errors/reward-inactive.error';
import { RewardNotFoundError } from '../errors/reward-not-found.error';
import { RewardOutOfStockError } from '../errors/reward-out-of-stock.error';
import {
  REWARD_REDEEMED,
  type RewardRedeemedPayload,
} from '../events/reward.events';
import type { RedeemedReward } from '../interfaces/redeemed-reward.interface';
import { RedemptionRepository } from '../repositories/redemption.repository';
import { RewardRepository } from '../repositories/reward.repository';

export interface RedeemRewardCommand {
  userId: string;
  rewardId: string;
  idempotencyKey: string;
}

@Injectable()
export class RedeemRewardService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly rewards: RewardRepository,
    private readonly redemptions: RedemptionRepository,
    private readonly pointLedger: PointLedgerRepository,
    private readonly receiverBalance: ReceiverBalanceRepository,
    private readonly receiverBalanceService: ReceiverBalanceService,
    private readonly outbox: OutboxRepository,
  ) {}

  // structurally the send-kudo shape (§6): an invariant-gated debit recorded
  // in the ledger — but single-sided, no receiver, no compensation.
  redeemReward(command: RedeemRewardCommand): Promise<RedeemedReward> {
    return this.unitOfWork.run(async () => {
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

      // reconcile under lock — display is eventually consistent, spending
      // must be exact (§6). Throws RecipientNotProvisionedError if the
      // user has no receiver_balance row.
      const authoritativeBalance =
        await this.receiverBalanceService.syncFromLedger(command.userId);
      if (authoritativeBalance < reward.costPoints) {
        throw new InsufficientBalanceError();
      }

      if (reward.stock !== null) {
        const reserved = await this.rewards.reserveStock(reward.id);
        if (!reserved) {
          throw new RewardOutOfStockError();
        }
      }

      const redemptionId = randomUUID();
      await this.redemptions.create({
        id: redemptionId,
        userId: command.userId,
        rewardId: reward.id,
        costPoints: reward.costPoints,
        idempotencyKey: command.idempotencyKey,
      });

      const ledgerId = await this.pointLedger.appendRedeemDebit({
        userId: command.userId,
        points: reward.costPoints,
        redemptionId,
      });
      // projection updated under the same lock syncFromLedger already took —
      // advances the checkpoint too, so this row is never re-summed later.
      await this.receiverBalance.applyDelta(
        command.userId,
        -reward.costPoints,
        ledgerId,
      );

      const rewardRedeemed: RewardRedeemedPayload = {
        redemptionId,
        userId: command.userId,
        rewardId: reward.id,
        costPoints: reward.costPoints,
      };
      await this.outbox.enqueue({
        id: `redemption:${redemptionId}`,
        topic: REWARD_REDEEMED,
        payload: rewardRedeemed as unknown as Record<string, unknown>,
      });

      return { redemptionId, status: 'confirmed' };
    });
  }
}
