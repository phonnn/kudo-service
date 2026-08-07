import { Test } from '@nestjs/testing';
import { UnitOfWork } from '@kudo/database';
import type { RealtimePush } from '@kudo/realtime';
import { REALTIME_PUSH } from '../../../infra/token.constant';
import { OutboxRepository } from '../../outbox';
import { ReactionType } from '../dto/reaction-type.enum';
import { FeedPostNotFoundError } from '../errors/feed-post-not-found.error';
import { FeedPostRepository } from '../repositories/feed-post.repository';
import { ReactionRepository } from '../repositories/reaction.repository';
import { ReactionService } from './reaction.service';

describe('ReactionService', () => {
  describe('setReaction', () => {
    it('throws when the post does not exist or is not published', async () => {
      const { service, deps } = await createService();
      deps.feedPosts.findPublishedById.mockResolvedValue(null);

      await expect(
        service.setReaction('post-1', 'user-1', ReactionType.LIKE),
      ).rejects.toThrow(FeedPostNotFoundError);
      expect(deps.reactions.upsert).not.toHaveBeenCalled();
    });

    it('on a genuinely new reaction: bumps the count, enqueues reaction.created, and publishes the new count', async () => {
      const { service, deps } = await createService();
      deps.reactions.upsert.mockResolvedValue({ wasNew: true });
      deps.feedPosts.adjustReactionCount.mockResolvedValue(3);

      await service.setReaction('post-1', 'user-1', ReactionType.LIKE);

      expect(deps.feedPosts.adjustReactionCount).toHaveBeenCalledWith(
        'post-1',
        1,
      );
      expect(deps.outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'reaction.created' }),
      );
      expect(deps.realtime.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: { postId: 'post-1', reactionCount: 3 },
        }),
      );
    });

    it('on a type change to an existing reaction: does not touch the count or enqueue anything', async () => {
      const { service, deps } = await createService();
      deps.reactions.upsert.mockResolvedValue({ wasNew: false });

      await service.setReaction('post-1', 'user-1', ReactionType.LIKE);

      expect(deps.feedPosts.adjustReactionCount).not.toHaveBeenCalled();
      expect(deps.outbox.enqueue).not.toHaveBeenCalled();
      expect(deps.realtime.publish).not.toHaveBeenCalled();
    });
  });

  describe('removeReaction', () => {
    it('decrements the count and publishes when a reaction was actually removed', async () => {
      const { service, deps } = await createService();
      deps.reactions.remove.mockResolvedValue({ wasRemoved: true });
      deps.feedPosts.adjustReactionCount.mockResolvedValue(2);

      await service.removeReaction('post-1', 'user-1');

      expect(deps.feedPosts.adjustReactionCount).toHaveBeenCalledWith(
        'post-1',
        -1,
      );
      expect(deps.realtime.publish).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          data: { postId: 'post-1', reactionCount: 2 },
        }),
      );
    });

    it('is a silent no-op when there was nothing to remove', async () => {
      const { service, deps } = await createService();
      deps.reactions.remove.mockResolvedValue({ wasRemoved: false });

      await service.removeReaction('post-1', 'user-1');

      expect(deps.feedPosts.adjustReactionCount).not.toHaveBeenCalled();
      expect(deps.realtime.publish).not.toHaveBeenCalled();
    });
  });
});

interface MockDeps {
  feedPosts: jest.Mocked<
    Pick<FeedPostRepository, 'findPublishedById' | 'adjustReactionCount'>
  >;
  reactions: jest.Mocked<Pick<ReactionRepository, 'upsert' | 'remove'>>;
  outbox: jest.Mocked<Pick<OutboxRepository, 'enqueue'>>;
  realtime: jest.Mocked<Pick<RealtimePush, 'publish'>>;
}

function createDeps(): MockDeps {
  return {
    feedPosts: {
      findPublishedById: jest
        .fn()
        .mockResolvedValue({ id: 'post-1', authorId: 'author-1' }),
      adjustReactionCount: jest.fn().mockResolvedValue(1),
    },
    reactions: {
      upsert: jest.fn().mockResolvedValue({ wasNew: true }),
      remove: jest.fn().mockResolvedValue({ wasRemoved: true }),
    },
    outbox: { enqueue: jest.fn() },
    realtime: { publish: jest.fn() },
  };
}

async function createService(): Promise<{
  service: ReactionService;
  deps: MockDeps;
}> {
  const deps = createDeps();
  const uow = {
    run: (work: () => Promise<unknown>) => work(),
  } as unknown as UnitOfWork;

  const module = await Test.createTestingModule({
    providers: [
      ReactionService,
      { provide: UnitOfWork, useValue: uow },
      { provide: FeedPostRepository, useValue: deps.feedPosts },
      { provide: ReactionRepository, useValue: deps.reactions },
      { provide: OutboxRepository, useValue: deps.outbox },
      { provide: REALTIME_PUSH, useValue: deps.realtime },
    ],
  }).compile();

  return { service: module.get(ReactionService), deps };
}
