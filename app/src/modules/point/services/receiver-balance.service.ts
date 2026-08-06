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

  // Folds only ledger rows newer than the checkpoint — bounded cost per call
  // (normally just the one new row), not a full-history rescan. Locks the
  // row before reading the checkpoint so concurrent folds for the same
  // recipient (a burst of kudos landing close together) serialize instead
  // of both reading the same pre-fold checkpoint and double-counting. Must
  // be called from inside a unitOfWork.run() block — see
  // ReceiverBalanceRepository.lockForUpdate.
  async syncFromLedger(userId: string): Promise<void> {
    const checkpoint = await this.receiverBalance.lockForUpdate(userId);
    if (!checkpoint) {
      throw new RecipientNotProvisionedError();
    }

    const { total, maxId } = await this.pointLedger.sumEarnedSince(
      userId,
      checkpoint.lastLedgerId,
    );

    if (maxId === null) return;

    await this.receiverBalance.applyDelta(userId, total, maxId);
  }
}
