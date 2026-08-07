import { Test } from '@nestjs/testing';
import { UnitOfWork } from '@kudo/database';
import { Tag } from '../dto/tag.enum';
import { InsufficientBudgetError } from '../../point/errors/insufficient-budget.error';
import { SelfRecognitionError } from '../../point/errors/self-recognition.error';
import { PointTransferService } from '../../point/services/point-transfer.service';
import { OutboxRepository } from '../../outbox';
import { FeedMediaRepository } from '../repositories/feed-media.repository';
import { FeedPostRepository } from '../repositories/feed-post.repository';
import { ReactionRepository } from '../repositories/reaction.repository';
import { FeedPostService } from './feed-post.service';

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
      const { service, deps } = await createService();
      const result = await service.sendKudo(command);

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
      const { service, deps } = await createService();
      const media = {
        objectKey: 'media/abc',
        domain: 'http://minio:9000/kudo',
      };
      await service.sendKudo({ ...command, media });

      expect(deps.feedMedia.create).toHaveBeenCalledWith(
        expect.objectContaining(media),
      );
    });

    it('returns the existing post for an idempotent retry, without reserving again', async () => {
      const { service, deps } = await createService();
      deps.feedPosts.findByIdempotencyKey.mockResolvedValue({
        id: 'post',
        status: 'published',
        transferId: 'transfer',
      });

      await expect(service.sendKudo(command)).resolves.toEqual({
        transferId: 'transfer',
        postId: 'post',
        status: 'published',
      });
      expect(deps.pointTransfers.reserveBudget).not.toHaveBeenCalled();
    });

    it('propagates the domain error reserveBudget throws, without creating a post', async () => {
      const { service, deps } = await createService();
      deps.pointTransfers.reserveBudget.mockRejectedValue(
        new InsufficientBudgetError(),
      );

      await expect(service.sendKudo(command)).rejects.toThrow(
        InsufficientBudgetError,
      );
      expect(deps.feedPosts.create).not.toHaveBeenCalled();
    });

    it('rejects self recognition before opening a transaction', async () => {
      const uow = { run: jest.fn() };
      const { service } = await createService({
        uow: uow as unknown as UnitOfWork,
      });

      expect(() =>
        service.sendKudo({ ...command, recipientId: 'sender' }),
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

async function createService(
  options: { uow?: UnitOfWork } = {},
): Promise<{ service: FeedPostService; deps: MockDeps }> {
  const deps = createDeps();
  const uow =
    options.uow ??
    ({
      run: (work: () => Promise<unknown>) => work(),
    } as unknown as UnitOfWork);

  const module = await Test.createTestingModule({
    providers: [
      FeedPostService,
      { provide: UnitOfWork, useValue: uow },
      { provide: FeedPostRepository, useValue: deps.feedPosts },
      { provide: FeedMediaRepository, useValue: deps.feedMedia },
      { provide: ReactionRepository, useValue: deps.reactions },
      { provide: PointTransferService, useValue: deps.pointTransfers },
      { provide: OutboxRepository, useValue: deps.outbox },
    ],
  }).compile();

  return { service: module.get(FeedPostService), deps };
}
