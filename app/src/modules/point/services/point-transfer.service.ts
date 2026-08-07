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

  async reserveBudget(senderId: string, points: number): Promise<void> {
    const remaining = await this.senderBalances.getRemaining(senderId);
    if (remaining === null) {
      throw new SenderNotProvisionedError();
    }
    if (remaining < points) {
      throw new InsufficientBudgetError();
    }
  }

  // The idempotency check must run first — reserve() itself has no idea
  // about idempotency keys, only findByIdempotencyKey does.
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

      // outbox.id is globally unique, not scoped per topic — the bare
      // transferId is already taken by this same transfer's kudo.reserved row.
      await this.outbox.enqueue({
        id: `kudo:${payload.transferId}:debited`,
        topic: KUDO_DEBITED,
        payload: kudoDebited as unknown as Record<string, unknown>,
      });
    });
  }

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
      // Deterministic id dedupes the enqueue across at-least-once redelivery.
      await this.outbox.enqueue({
        id: `kudo:${payload.transferId}:credited`,
        topic: KUDO_CREDITED,
        payload: kudoCredited as unknown as Record<string, unknown>,
      });
    });
  }
}
