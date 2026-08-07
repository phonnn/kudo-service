import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import { OutboxRepository } from '../../outbox';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';
import type { ReactionType } from '../dto/reaction-type.enum';
import {
  REACTION_CREATED,
  type ReactionCreatedPayload,
} from '../events/domain-events';
import {
  FEED_ROOM,
  POST_UPDATED,
  type PostUpdatedEvent,
} from '../events/realtime-events';
import { FeedPostRepository } from '../repositories/feed-post.repository';
import { ReactionRepository } from '../repositories/reaction.repository';

@Injectable()
export class ReactionService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly feedPosts: FeedPostRepository,
    private readonly reactions: ReactionRepository,
    private readonly outbox: OutboxRepository,
    @Inject(REALTIME_PUSH) private readonly realtime: RealtimePush,
  ) {}

  async setReaction(
    postId: string,
    userId: string,
    type: ReactionType,
  ): Promise<void> {
    const reactionCount = await this.unitOfWork.run(async () => {
      const post = await this.feedPosts.findPublishedById(postId);
      if (!post) {
        throw new FeedPostNotFoundError();
      }

      // Only a genuinely new reaction moves the count and fires the
      // notification event — a type change on an existing reaction doesn't.
      const { wasNew } = await this.reactions.upsert(postId, userId, type);
      if (!wasNew) return null;

      const reactionCreated: ReactionCreatedPayload = {
        postId,
        postAuthorId: post.authorId,
        userId,
        type,
      };

      await this.outbox.enqueue({
        id: randomUUID(),
        topic: REACTION_CREATED,
        payload: reactionCreated as unknown as Record<string, unknown>,
      });

      return this.feedPosts.adjustReactionCount(postId, 1);
    });

    this.publishChanged(postId, reactionCount);
  }

  async removeReaction(postId: string, userId: string): Promise<void> {
    const reactionCount = await this.unitOfWork.run(async () => {
      const { wasRemoved } = await this.reactions.remove(postId, userId);
      return wasRemoved
        ? await this.feedPosts.adjustReactionCount(postId, -1)
        : null;
    });

    this.publishChanged(postId, reactionCount);
  }

  private publishChanged(postId: string, reactionCount: number | null): void {
    if (reactionCount === null) return;
    const event: PostUpdatedEvent = { postId, reactionCount };
    this.realtime.publish(FEED_ROOM, { type: POST_UPDATED, data: event });
  }
}
