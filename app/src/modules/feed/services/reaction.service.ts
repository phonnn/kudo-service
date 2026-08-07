import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';
import type { ReactionType } from '../dto/reaction-type.enum';
import { FeedPostRepository } from '../repositories/feed-post.repository';
import { ReactionRepository } from '../repositories/reaction.repository';

@Injectable()
export class ReactionService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly feedPosts: FeedPostRepository,
    private readonly reactions: ReactionRepository,
  ) {}

  setReaction(
    postId: string,
    userId: string,
    type: ReactionType,
  ): Promise<void> {
    return this.unitOfWork.run(async () => {
      const post = await this.feedPosts.findPublishedById(postId);
      if (!post) {
        throw new FeedPostNotFoundError();
      }

      // a type change on an existing reaction is still exactly one
      // reaction — only a genuinely new row moves the count.
      const { wasNew } = await this.reactions.upsert(postId, userId, type);
      if (wasNew) {
        await this.feedPosts.adjustReactionCount(postId, 1);
      }
    });
  }

  removeReaction(postId: string, userId: string): Promise<void> {
    return this.unitOfWork.run(async () => {
      const { wasRemoved } = await this.reactions.remove(postId, userId);
      if (wasRemoved) {
        await this.feedPosts.adjustReactionCount(postId, -1);
      }
    });
  }
}
