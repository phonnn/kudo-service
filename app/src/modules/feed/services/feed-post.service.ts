import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { randomUUID } from 'node:crypto';
import type { Tag } from '../dto/tag.enum';
import {
  KUDO_RESERVED,
  type KudoReservedPayload,
} from '../../point/events/kudo.events';
import { SelfRecognitionError } from '../../point/errors/self-recognition.error';
import { validatePoints } from '../../point/helpers/points.helper';
import { PointTransferService } from '../../point/services/point-transfer.service';
import { OutboxRepository } from '../../outbox';
import type { CreatedKudo } from '../interfaces/created-kudo.interface';
import { FeedMediaRepository } from '../repositories/feed-media.repository';
import {
  FeedPostRepository,
  type FeedPostRecord,
} from '../repositories/feed-post.repository';

export interface CreatePendingPostMedia {
  objectKey: string;
  domain: string;
}

export interface CreatePendingPostCommand {
  postId: string;
  authorId: string;
  description: string;
  tag: Tag;
  transferId: string;
  idempotencyKey: string;
  media?: CreatePendingPostMedia;
}

export interface SendKudoCommand {
  senderId: string;
  recipientId: string;
  points: number;
  tag: Tag;
  description: string;
  idempotencyKey: string;
  media?: CreatePendingPostMedia;
}

// Everything about feed_post/feed_media, including the send-kudo use case
// itself (§4 Phase 1) — feed_post is the primary object, point_transfer is
// attached to it, which is why the HTTP entry point and this orchestration
// live in `feed`, not `point`. `point` is only asked to do the one
// synchronous thing whose failure the caller must see (P4): reserve the
// budget. Everything else about actually recording the transfer is
// deferred to PointTransferService.reserveKudoPoints(), reacting to
// kudo.reserved — `point` doesn't create feed_post, and this service
// doesn't create point_transfer.
@Injectable()
export class FeedPostService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly feedPosts: FeedPostRepository,
    private readonly feedMedia: FeedMediaRepository,
    private readonly pointTransfers: PointTransferService,
    private readonly outbox: OutboxRepository,
  ) {}

  // the primary idempotency guard for sendKudo (§4) — the post is the
  // first thing created, before point_transfer exists.
  findByIdempotencyKey(key: string): Promise<FeedPostRecord | null> {
    return this.feedPosts.findByIdempotencyKey(key);
  }

  // Must be called from inside a unitOfWork.run() block — see
  // ARCHITECTURE.md §4 Phase 1: the post (and its media, if any) has to
  // commit atomically with the budget reserve, so this relies on the
  // ambient transaction the caller already opened rather than opening its
  // own (same pattern as ReceiverBalanceService.syncFromLedger).
  async createPendingPost(command: CreatePendingPostCommand): Promise<void> {
    await this.feedPosts.create({
      id: command.postId,
      authorId: command.authorId,
      description: command.description,
      tag: command.tag,
      transferId: command.transferId,
      idempotencyKey: command.idempotencyKey,
    });

    // images need no async validate/transcode step (§16), so this writes
    // straight to 'ready' inside the same transaction as the post above.
    if (command.media) {
      await this.feedMedia.create({
        id: randomUUID(),
        postId: command.postId,
        objectKey: command.media.objectKey,
        domain: command.media.domain,
      });
    }
  }

  sendKudo(command: SendKudoCommand): Promise<CreatedKudo> {
    if (command.senderId === command.recipientId) {
      throw new SelfRecognitionError();
    }

    validatePoints(command.points);
    return this.unitOfWork.run(async () => {
      const existingPost = await this.findByIdempotencyKey(
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

      await this.createPendingPost({
        postId,
        authorId: command.senderId,
        description: command.description,
        tag: command.tag,
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
