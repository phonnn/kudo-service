import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { OutboxRepository } from '../../outbox';
import {
  KUDO_CREDITED,
  KUDO_DEBITED,
  KUDO_RESERVATION_FAILED,
  type KudoCreditedPayload,
  type KudoDebitedPayload,
  type KudoReservationFailedPayload,
  type KudoReservedPayload,
} from '../events/kudo.events';
import { InsufficientBudgetError } from '../errors/insufficient-budget.error';
import { SenderNotProvisionedError } from '../errors/sender-not-provisioned.error';
import { PointLedgerRepository } from '../repositories/point-ledger.repository';
import { PointTransferRepository } from '../repositories/point-transfer.repository';
import { SenderBalanceRepository } from '../repositories/sender-balance.repository';

@Injectable()
export class PointTransferService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly senderBalances: SenderBalanceRepository,
    private readonly pointTransfers: PointTransferRepository,
    private readonly pointLedger: PointLedgerRepository,
    private readonly outbox: OutboxRepository,
  ) {}

  // The one synchronous, fail-fast call `feed`'s FeedPostService.sendKudo()
  // makes into `point` (§4 Phase 1). This is a quick, unlocked READ — not the
  // authoritative gate. The real atomic reserve happens later, in
  // reserveKudoPoints() (Phase 1.5), in the same transaction as the ledger
  // debit, so "balance moves with the ledger" stays true. This pre-check
  // exists purely so an obviously-doomed request fails fast with an honest
  // error instead of paying for a round trip through the event chain first.
  async reserveBudget(senderId: string, points: number): Promise<void> {
    const remaining = await this.senderBalances.getRemaining(senderId);
    if (remaining === null) {
      throw new SenderNotProvisionedError();
    }
    if (remaining < points) {
      throw new InsufficientBudgetError();
    }
  }

  // Phase 1.5 (§4): reacts to kudo.reserved. The idempotency check comes
  // first so a redelivery after this already fully succeeded can't
  // double-reserve — reserve() itself has no idea about idempotency keys,
  // only findByIdempotencyKey does. If the atomic reserve then fails, that
  // means Phase 1's pre-check went stale (a real race, not a request-time
  // error the sender saw synchronously) — this gives up on this specific
  // kudo rather than retrying indefinitely, since a stale budget check
  // rarely un-stales itself. feed's own listener reacts to
  // kudo.reservation-failed by marking its post 'failed'; point never
  // touches feed_post directly (§12).
  reserveKudoPoints(payload: KudoReservedPayload): Promise<void> {
    return this.unitOfWork.run(async () => {
      const existing = await this.pointTransfers.findByIdempotencyKey(
        payload.idempotencyKey,
      );
      if (existing) {
        return; // at-least-once redelivery — already fully processed
      }

      const reserved = await this.senderBalances.reserve(
        payload.senderId,
        payload.points,
      );

      if (!reserved) {
        const reservationFailed: KudoReservationFailedPayload = {
          transferId: payload.transferId,
        };
        await this.outbox.enqueue({
          id: `kudo:${payload.transferId}:reservation-failed`,
          topic: KUDO_RESERVATION_FAILED,
          payload: reservationFailed as unknown as Record<string, unknown>,
        });
        return;
      }

      const created = await this.pointTransfers.create({
        id: payload.transferId,
        senderId: payload.senderId,
        recipientId: payload.recipientId,
        points: payload.points,
        idempotencyKey: payload.idempotencyKey,
      });

      if (!created) {
        return; // belt-and-suspenders — findByIdempotencyKey above already guards this
      }

      await this.pointLedger.appendGivingDebit({
        userId: payload.senderId,
        points: payload.points,
        transferId: payload.transferId,
        idempotencyKey: payload.idempotencyKey,
      });

      const kudoDebited: KudoDebitedPayload = {
        transferId: payload.transferId,
        postId: payload.postId,
        senderId: payload.senderId,
        recipientId: payload.recipientId,
        points: payload.points,
      };

      await this.outbox.enqueue({
        id: payload.transferId,
        topic: KUDO_DEBITED,
        payload: kudoDebited as unknown as Record<string, unknown>,
      });
    });
  }

  // saga tail for kudo.debited (§5) — ledger is authoritative on arrival,
  // written first and idempotent, safe under at-least-once redelivery.
  // Completing the transfer and publishing the post are separate concerns,
  // each owned by their module, reacting to kudo.credited independently
  // (see point/listeners and feed/listeners).
  creditKudo(payload: KudoDebitedPayload): Promise<void> {
    return this.unitOfWork.run(async () => {
      await this.pointLedger.appendEarnCredit({
        userId: payload.recipientId,
        points: payload.points,
        transferId: payload.transferId,
      });

      const kudoCredited: KudoCreditedPayload = {
        transferId: payload.transferId,
        postId: payload.postId,
        recipientId: payload.recipientId,
        points: payload.points,
      };
      // deterministic id: dedupes the enqueue itself across at-least-once
      // redelivery of kudo.debited, on top of the idempotent ledger/status writes above
      await this.outbox.enqueue({
        id: `kudo:${payload.transferId}:credited`,
        topic: KUDO_CREDITED,
        payload: kudoCredited as unknown as Record<string, unknown>,
      });
    });
  }
}
