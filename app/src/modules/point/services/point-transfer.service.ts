import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { randomUUID } from 'node:crypto';
import { FeedPostRepository } from '../../feed';
import { OutboxRepository } from '../../outbox';
import type { CoreValue } from '../dto/send-kudo.dto';
import {
  KUDO_CREDITED,
  KUDO_DEBITED,
  type KudoCreditedPayload,
  type KudoDebitedPayload,
} from '../events/kudo.events';
import { InsufficientBudgetError } from '../errors/insufficient-budget.error';
import { SelfRecognitionError } from '../errors/self-recognition.error';
import { SenderNotProvisionedError } from '../errors/sender-not-provisioned.error';
import { validatePoints } from '../helpers/points.helper';
import type { CreatedKudo } from '../interfaces/created-kudo.interface';
import { PointLedgerRepository } from '../repositories/point-ledger.repository';
import { PointTransferRepository } from '../repositories/point-transfer.repository';
import { SenderBalanceRepository } from '../repositories/sender-balance.repository';
export interface SendKudoCommand {
  senderId: string;
  recipientId: string;
  points: number;
  coreValue: CoreValue;
  description: string;
  idempotencyKey: string;
}
@Injectable()
export class PointTransferService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly senderBalances: SenderBalanceRepository,
    private readonly pointTransfers: PointTransferRepository,
    private readonly pointLedger: PointLedgerRepository,
    private readonly feedPosts: FeedPostRepository,
    private readonly outbox: OutboxRepository,
  ) {}
  sendKudo(command: SendKudoCommand): Promise<CreatedKudo> {
    if (command.senderId === command.recipientId) {
      throw new SelfRecognitionError();
    }

    validatePoints(command.points);
    return this.unitOfWork.run(async () => {
      const existingTransfer = await this.pointTransfers.findByIdempotencyKey(
        command.idempotencyKey,
      );

      if (existingTransfer?.status === 'pending') {
        const existingPost = await this.feedPosts.findByTransferId(
          existingTransfer.id,
        );

        if (existingPost) {
          return {
            transferId: existingTransfer.id,
            postId: existingPost.id,
            status: 'pending',
          };
        }
      }

      const reserved = await this.senderBalances.reserve(
        command.senderId,
        command.points,
      );

      if (!reserved) {
        const senderProvisioned = await this.senderBalances.exists(
          command.senderId,
        );

        if (!senderProvisioned) {
          throw new SenderNotProvisionedError();
        }

        throw new InsufficientBudgetError();
      }

      const transferId = randomUUID();
      const postId = randomUUID();
      await this.pointTransfers.create({
        id: transferId,
        senderId: command.senderId,
        recipientId: command.recipientId,
        points: command.points,
        coreValue: command.coreValue,
        idempotencyKey: command.idempotencyKey,
      });

      await this.pointLedger.appendGivingDebit({
        userId: command.senderId,
        points: command.points,
        transferId,
        idempotencyKey: command.idempotencyKey,
      });

      await this.feedPosts.create({
        id: postId,
        authorId: command.senderId,
        description: command.description,
        transferId,
      });

      const kudoDebited: KudoDebitedPayload = {
        transferId,
        postId,
        senderId: command.senderId,
        recipientId: command.recipientId,
        points: command.points,
      };

      await this.outbox.enqueue({
        id: transferId,
        topic: KUDO_DEBITED,
        payload: kudoDebited as unknown as Record<string, unknown>,
      });

      return { transferId, postId, status: 'pending' };
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
