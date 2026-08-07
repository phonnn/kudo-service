import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '@kudo/database';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';
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
  ) {}

  addComment(command: AddCommentCommand): Promise<CommentRecord> {
    return this.unitOfWork.run(async () => {
      const post = await this.feedPosts.findPublishedById(command.postId);
      if (!post) {
        throw new FeedPostNotFoundError();
      }

      const comment = await this.comments.create({
        id: randomUUID(),
        postId: command.postId,
        authorId: command.authorId,
        body: command.body,
      });

      await this.feedPosts.incrementCommentCount(command.postId);

      return comment;
    });
  }
}
