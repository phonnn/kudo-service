import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import { OutboxRepository } from '../../outbox';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';
import {
  COMMENT_CREATED,
  type CommentCreatedPayload,
} from '../events/domain-events';
import {
  FEED_ROOM,
  POST_UPDATED,
  type PostUpdatedEvent,
} from '../events/realtime-events';
import {
  CommentRepository,
  type CommentRecord,
} from '../repositories/comment.repository';
import { FeedPostRepository } from '../repositories/feed-post.repository';

export interface AddCommentCommand {
  postId: string;
  authorId: string;
  body: string;
}

@Injectable()
export class CommentService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly feedPosts: FeedPostRepository,
    private readonly comments: CommentRepository,
    private readonly outbox: OutboxRepository,
    @Inject(REALTIME_PUSH) private readonly realtime: RealtimePush,
  ) {}

  async addComment(command: AddCommentCommand): Promise<CommentRecord> {
    const { comment, commentCount } = await this.unitOfWork.run(async () => {
      const post = await this.feedPosts.findPublishedById(command.postId);
      if (!post) {
        throw new FeedPostNotFoundError();
      }

      const created = await this.comments.create({
        id: randomUUID(),
        postId: command.postId,
        authorId: command.authorId,
        body: command.body,
      });

      const count = await this.feedPosts.incrementCommentCount(command.postId);

      const commentCreated: CommentCreatedPayload = {
        postId: command.postId,
        postAuthorId: post.authorId,
        commentId: created.id,
        authorId: command.authorId,
      };
      await this.outbox.enqueue({
        id: created.id,
        topic: COMMENT_CREATED,
        payload: commentCreated as unknown as Record<string, unknown>,
      });

      return { comment: created, commentCount: count };
    });

    // Published only after the transaction commits — a rolled-back write
    // must never appear as an event to connected clients.
    const event: PostUpdatedEvent = { postId: command.postId, commentCount };
    this.realtime.publish(FEED_ROOM, { type: POST_UPDATED, data: event });

    return comment;
  }
}
