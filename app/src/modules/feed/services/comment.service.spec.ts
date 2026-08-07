import { Test } from '@nestjs/testing';
import { UnitOfWork } from '@kudo/database';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import { OutboxRepository } from '../../outbox';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';
import { CommentRepository } from '../repositories/comment.repository';
import { FeedPostRepository } from '../repositories/feed-post.repository';
import { CommentService } from './comment.service';

describe('CommentService', () => {
  const command = {
    postId: 'post-1',
    authorId: 'author-1',
    body: 'Nice work!',
  };

  it('throws when the post does not exist or is not published, without creating a comment', async () => {
    const { service, deps } = await createService();
    deps.feedPosts.findPublishedById.mockResolvedValue(null);

    await expect(service.addComment(command)).rejects.toThrow(
      FeedPostNotFoundError,
    );
    expect(deps.comments.create).not.toHaveBeenCalled();
  });

  it('creates the comment, bumps the count, enqueues comment.created, and publishes the new count', async () => {
    const { service, deps } = await createService();
    deps.feedPosts.adjustReactionCount.mockResolvedValue(0);
    deps.feedPosts.incrementCommentCount.mockResolvedValue(4);

    const result = await service.addComment(command);

    expect(result).toEqual(
      expect.objectContaining({ id: 'comment-1', body: 'Nice work!' }),
    );
    expect(deps.outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'comment.created' }),
    );
    expect(deps.realtime.publish).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        data: { postId: 'post-1', commentCount: 4 },
      }),
    );
  });

  it('publishes only after the transaction has committed', async () => {
    const events: string[] = [];
    const deps = createDeps();
    deps.realtime.publish.mockImplementation(() => events.push('publish'));
    const uow = {
      run: async (work: () => Promise<unknown>) => {
        const result = await work();
        events.push('commit');
        return result;
      },
    } as unknown as UnitOfWork;

    const module = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: UnitOfWork, useValue: uow },
        { provide: FeedPostRepository, useValue: deps.feedPosts },
        { provide: CommentRepository, useValue: deps.comments },
        { provide: OutboxRepository, useValue: deps.outbox },
        { provide: REALTIME_PUSH, useValue: deps.realtime },
      ],
    }).compile();

    await module.get(CommentService).addComment(command);

    expect(events).toEqual(['commit', 'publish']);
  });
});

interface MockDeps {
  feedPosts: jest.Mocked<
    Pick<
      FeedPostRepository,
      'findPublishedById' | 'incrementCommentCount' | 'adjustReactionCount'
    >
  >;
  comments: jest.Mocked<Pick<CommentRepository, 'create'>>;
  outbox: jest.Mocked<Pick<OutboxRepository, 'enqueue'>>;
  realtime: jest.Mocked<Pick<RealtimePush, 'publish'>>;
}

function createDeps(): MockDeps {
  return {
    feedPosts: {
      findPublishedById: jest
        .fn()
        .mockResolvedValue({ id: 'post-1', authorId: 'author-1' }),
      incrementCommentCount: jest.fn().mockResolvedValue(1),
      adjustReactionCount: jest.fn().mockResolvedValue(0),
    },
    comments: {
      create: jest.fn().mockResolvedValue({
        id: 'comment-1',
        postId: 'post-1',
        authorId: 'author-1',
        body: 'Nice work!',
        createdAt: new Date(),
      }),
    },
    outbox: { enqueue: jest.fn() },
    realtime: { publish: jest.fn() },
  };
}

async function createService(): Promise<{
  service: CommentService;
  deps: MockDeps;
}> {
  const deps = createDeps();
  const uow = {
    run: (work: () => Promise<unknown>) => work(),
  } as unknown as UnitOfWork;

  const module = await Test.createTestingModule({
    providers: [
      CommentService,
      { provide: UnitOfWork, useValue: uow },
      { provide: FeedPostRepository, useValue: deps.feedPosts },
      { provide: CommentRepository, useValue: deps.comments },
      { provide: OutboxRepository, useValue: deps.outbox },
      { provide: REALTIME_PUSH, useValue: deps.realtime },
    ],
  }).compile();

  return { service: module.get(CommentService), deps };
}
