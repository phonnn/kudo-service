import type { UnitOfWork } from '@kudo/database';
import { CoreValue } from '../../point/dto/core-value.enum';
import { InsufficientBudgetError } from '../../point/errors/insufficient-budget.error';
import { SelfRecognitionError } from '../../point/errors/self-recognition.error';
import type { PointTransferService } from '../../point/services/point-transfer.service';
import type { OutboxRepository } from '../../outbox';
import type { FeedPostService } from './feed-post.service';
import { SendKudoService } from './send-kudo.service';

/* eslint-disable @typescript-eslint/unbound-method */

describe('SendKudoService', () => {
  const command = {
    senderId: 'sender',
    recipientId: 'recipient',
    points: 20,
    coreValue: CoreValue.TEAMWORK,
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
    expect(deps.feedPosts.createPendingPost).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'request-1',
        media: undefined,
      }),
    );
    expect(deps.outbox.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'kudo.reserved' }),
    );
    expect(result.status).toBe('pending');
  });

  it('passes the already-uploaded image through to feed post creation', async () => {
    const deps = createDeps();
    const media = { objectKey: 'media/abc', domain: 'http://minio:9000/kudo' };
    await createService(deps).sendKudo({ ...command, media });

    expect(deps.feedPosts.createPendingPost).toHaveBeenCalledWith(
      expect.objectContaining({ media }),
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
    expect(deps.feedPosts.createPendingPost).not.toHaveBeenCalled();
  });

  it('rejects self recognition before opening a transaction', () => {
    const deps = createDeps();
    const uow = { run: jest.fn() } as unknown as UnitOfWork;
    expect(() =>
      createService(deps, uow).sendKudo({ ...command, recipientId: 'sender' }),
    ).toThrow(SelfRecognitionError);
    expect(uow.run).not.toHaveBeenCalled();
  });
});

interface MockDeps {
  feedPosts: jest.Mocked<
    Pick<FeedPostService, 'findByIdempotencyKey' | 'createPendingPost'>
  >;
  pointTransfers: jest.Mocked<Pick<PointTransferService, 'reserveBudget'>>;
  outbox: jest.Mocked<Pick<OutboxRepository, 'enqueue'>>;
}

function createDeps(): MockDeps {
  return {
    feedPosts: {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      createPendingPost: jest.fn(),
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
): SendKudoService {
  return new SendKudoService(
    uow,
    deps.feedPosts as unknown as FeedPostService,
    deps.pointTransfers as unknown as PointTransferService,
    deps.outbox as unknown as OutboxRepository,
  );
}
