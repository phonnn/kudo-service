import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { randomUUID } from 'node:crypto';
import { FeedPostRepository } from '../../feed';
import { OutboxRepository } from '../../outbox';
import type { CoreValue } from '../dto/send-kudo.dto';
import { InsufficientBudgetError } from '../errors/insufficient-budget.error';
import { SelfRecognitionError } from '../errors/self-recognition.error';
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
    if (command.senderId === command.recipientId)
      throw new SelfRecognitionError();
    validatePoints(command.points);
    const period = new Date().toISOString().slice(0, 7);
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
      if (
        !(await this.senderBalances.reserve(
          command.senderId,
          period,
          command.points,
        ))
      )
        throw new InsufficientBudgetError();
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
      await this.outbox.enqueue({
        id: transferId,
        topic: 'kudo.debited',
        payload: {
          postId,
          transferId,
          senderId: command.senderId,
          recipientId: command.recipientId,
          points: command.points,
        },
      });
      return { transferId, postId, status: 'pending' };
    });
  }
}
