import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  transferId: string;
  idempotencyKey: string;
  media?: CreatePendingPostMedia;
}

// Everything a caller outside `feed` needs from feed_post/feed_media,
// behind one service — callers (currently only SendKudoService, its own
// module) don't reach into FeedPostRepository/FeedMediaRepository directly
// (§12: repository ownership follows the owning domain module). Listeners
// inside `feed` itself (KudoCreditedListener, KudoReservationFailedListener)
// use the repositories directly, same as any other intra-module access.
@Injectable()
export class FeedPostService {
  constructor(
    private readonly feedPosts: FeedPostRepository,
    private readonly feedMedia: FeedMediaRepository,
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
}
