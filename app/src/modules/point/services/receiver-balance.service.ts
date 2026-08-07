import { Injectable } from '@nestjs/common';
import { RecipientNotProvisionedError } from '../errors/recipient-not-provisioned.error';
import { PointLedgerRepository } from '../repositories/point-ledger.repository';
import { ReceiverBalanceRepository } from '../repositories/receiver-balance.repository';

@Injectable()
export class ReceiverBalanceService {
  constructor(
    private readonly receiverBalance: ReceiverBalanceRepository,
    private readonly pointLedger: PointLedgerRepository,
  ) {}

  // Locks the row before reading the checkpoint so concurrent folds for the
  // same recipient serialize instead of double-counting. Must be called from
  // inside a unitOfWork.run() block.
  async syncFromLedger(userId: string): Promise<number> {
    const checkpoint = await this.receiverBalance.lockForUpdate(userId);
    if (!checkpoint) {
      throw new RecipientNotProvisionedError();
    }

    const { total, maxId } = await this.pointLedger.sumBalanceChangesSince(
      userId,
      checkpoint.lastLedgerId,
    );

    if (maxId === null) return checkpoint.earnedPoints; // nothing new since the checkpoint

    return this.receiverBalance.applyDelta(userId, total, maxId);
  }
}
