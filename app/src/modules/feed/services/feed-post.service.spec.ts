import type { UnitOfWork } from '@kudo/database';
import { Tag } from '../dto/tag.enum';
import { InsufficientBudgetError } from '../../point/errors/insufficient-budget.error';
import { SelfRecognitionError } from '../../point/errors/self-recognition.error';
import type { PointTransferService } from '../../point/services/point-transfer.service';
import type { OutboxRepository } from '../../outbox';
import type { FeedMediaRepository } from '../repositories/feed-media.repository';
import type { FeedPostRepository } from '../repositories/feed-post.repository';
import type { ReactionRepository } from '../repositories/reaction.repository';
import { FeedPostService } from './feed-post.service';

/* eslint-disable @typescript-eslint/unbound-method */

describe('FeedPostService', () => {
  describe('sendKudo', () => {
    const command = {
      senderId: 'sender',
      recipientId: 'recipient',
      points: 20,
      tag: Tag.TEAMWORK,
      description: 'Great job',
      idempotencyKey: 'request-1',
    };

    it('reserves the budget, creates the post, and enqueues kudo.reserved', async () => {
      const deps = createDeps();
      const result = await createService(deps).sendKudo(command);

      expect(deps.pointTransfers.reserveBudget).toHaveBeenCalledWith(
        'sender',
        20,
      );
      expect(deps.feedPosts.create).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: 'request-1' }),
      );
      expect(deps.feedMedia.create).not.toHaveBeenCalled();
      expect(deps.outbox.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({ topic: 'kudo.reserved' }),
      );
      expect(result.status).toBe('pending');
    });

    it('passes the already-uploaded image through to feed_media creation', async () => {
      const deps = createDeps();
      const media = {
        objectKey: 'media/abc',
        domain: 'http://minio:9000/kudo',
      };
      await createService(deps).sendKudo({ ...command, media });

      expect(deps.feedMedia.create).toHaveBeenCalledWith(
        expect.objectContaining(media),
      );
    });

    it('returns the existing post for an idempotent retry, without reserving again', async () => {
      const deps = createDeps();
      deps.feedPosts.findByIdempotencyKey.mockResolvedValue({
        id: 'post',
        status: 'published',
        transferId: 'transfer',
      });

      await expect(createService(deps).sendKudo(command)).resolves.toEqual({
        transferId: 'transfer',
        postId: 'post',
        status: 'published',
      });
      expect(deps.pointTransfers.reserveBudget).not.toHaveBeenCalled();
    });

    it('propagates the domain error reserveBudget throws, without creating a post', async () => {
      const deps = createDeps();
      deps.pointTransfers.reserveBudget.mockRejectedValue(
        new InsufficientBudgetError(),
      );

      await expect(createService(deps).sendKudo(command)).rejects.toThrow(
        InsufficientBudgetError,
      );
      expect(deps.feedPosts.create).not.toHaveBeenCalled();
    });

    it('rejects self recognition before opening a transaction', () => {
      const deps = createDeps();
      const uow = { run: jest.fn() } as unknown as UnitOfWork;
      expect(() =>
        createService(deps, uow).sendKudo({
          ...command,
          recipientId: 'sender',
        }),
      ).toThrow(SelfRecognitionError);
      expect(uow.run).not.toHaveBeenCalled();
    });
  });
});

interface MockDeps {
  feedPosts: jest.Mocked<
    Pick<FeedPostRepository, 'findByIdempotencyKey' | 'create'>
  >;
  feedMedia: jest.Mocked<Pick<FeedMediaRepository, 'create'>>;
  reactions: jest.Mocked<Pick<ReactionRepository, 'findTypesByPostIdsAndUser'>>;
  pointTransfers: jest.Mocked<Pick<PointTransferService, 'reserveBudget'>>;
  outbox: jest.Mocked<Pick<OutboxRepository, 'enqueue'>>;
}

function createDeps(): MockDeps {
  return {
    feedPosts: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
    feedMedia: { create: jest.fn() },
    reactions: {
      findTypesByPostIdsAndUser: jest.fn().mockResolvedValue(new Map()),
    },
    pointTransfers: {
      reserveBudget: jest.fn().mockResolvedValue(undefined),
    },
    outbox: { enqueue: jest.fn() },
  };
}

function createService(
  deps: MockDeps,
  uow: UnitOfWork = {
    run: (work: () => Promise<unknown>) => work(),
  } as unknown as UnitOfWork,
): FeedPostService {
  return new FeedPostService(
    uow,
    deps.feedPosts as unknown as FeedPostRepository,
    deps.feedMedia as unknown as FeedMediaRepository,
    deps.reactions as unknown as ReactionRepository,
    deps.pointTransfers as unknown as PointTransferService,
    deps.outbox as unknown as OutboxRepository,
  );
}
