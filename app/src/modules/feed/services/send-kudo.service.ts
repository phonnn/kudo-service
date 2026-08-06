import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { randomUUID } from 'node:crypto';
import type { CoreValue } from '../../point/dto/core-value.enum';
import {
  KUDO_RESERVED,
  type KudoReservedPayload,
} from '../../point/events/kudo.events';
import { SelfRecognitionError } from '../../point/errors/self-recognition.error';
import { validatePoints } from '../../point/helpers/points.helper';
import { PointTransferService } from '../../point/services/point-transfer.service';
import { OutboxRepository } from '../../outbox';
import type { CreatedKudo } from '../interfaces/created-kudo.interface';
import {
  FeedPostService,
  type CreatePendingPostMedia,
} from './feed-post.service';

export interface SendKudoCommand {
  senderId: string;
  recipientId: string;
  points: number;
  coreValue: CoreValue;
  description: string;
  idempotencyKey: string;
  media?: CreatePendingPostMedia;
}

// The Phase 1 entry point (§4): feed_post is the primary object here,
// point_transfer is attached to it — this is why the HTTP entry point and
// this orchestration live in `feed`, not `point`. `point` is only asked to
// do the one synchronous thing whose failure the caller must see (P4):
// reserve the budget. Everything else about actually recording the
// transfer is deferred to PointTransferService.reserveKudoPoints(),
// reacting to kudo.reserved — `point` doesn't create feed_post, and this
// service doesn't create point_transfer.
@Injectable()
export class SendKudoService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly feedPosts: FeedPostService,
    private readonly pointTransfers: PointTransferService,
    private readonly outbox: OutboxRepository,
  ) {}

  sendKudo(command: SendKudoCommand): Promise<CreatedKudo> {
    if (command.senderId === command.recipientId) {
      throw new SelfRecognitionError();
    }

    validatePoints(command.points);
    return this.unitOfWork.run(async () => {
      const existingPost = await this.feedPosts.findByIdempotencyKey(
        command.idempotencyKey,
      );

      if (existingPost) {
        return {
          transferId: existingPost.transferId,
          postId: existingPost.id,
          status: existingPost.status,
        };
      }

      // the one synchronous, fail-fast call into `point` (§4 Phase 1) —
      // participates in this same transaction, see reserveBudget()'s comment.
      await this.pointTransfers.reserveBudget(command.senderId, command.points);

      // minted now, before point_transfer exists — KudoReservedListener
      // uses this same id when it eventually creates that row.
      const transferId = randomUUID();
      const postId = randomUUID();

      await this.feedPosts.createPendingPost({
        postId,
        authorId: command.senderId,
        description: command.description,
        transferId,
        idempotencyKey: command.idempotencyKey,
        media: command.media,
      });

      const kudoReserved: KudoReservedPayload = {
        transferId,
        postId,
        senderId: command.senderId,
        recipientId: command.recipientId,
        points: command.points,
        coreValue: command.coreValue,
        idempotencyKey: command.idempotencyKey,
      };

      await this.outbox.enqueue({
        id: transferId,
        topic: KUDO_RESERVED,
        payload: kudoReserved as unknown as Record<string, unknown>,
      });

      return { transferId, postId, status: 'pending' };
    });
  }
}
